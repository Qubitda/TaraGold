"""ADR-0039 — Binance bookTicker ingest (REST poll; WS opsiyonel).

Celery yok. Ayrı süreç: `python manage.py ingest_binance_piyasa --loop`
"""

from __future__ import annotations

import asyncio
import time

from django.core.management.base import BaseCommand, CommandError

from tanimlar.services.ingest.pipeline import run_rest_poll_once


class Command(BaseCommand):
    help = "Binance bookTicker → tick cache + throttle MetalKuru/DovizKuru (ADR-0039)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--once",
            action="store_true",
            help="Tek REST poll (varsayılan).",
        )
        parser.add_argument(
            "--loop",
            action="store_true",
            help="Sürekli REST poll (WS yoksa yedek).",
        )
        parser.add_argument(
            "--interval",
            type=float,
            default=2.0,
            help="Loop aralığı (sn).",
        )
        parser.add_argument(
            "--ws",
            action="store_true",
            help="WebSocket combined stream dene (websockets paketi gerekir).",
        )

    def handle(self, *args, **options):
        if options["ws"]:
            try:
                asyncio.run(self._ws_loop(interval=options["interval"]))
            except ImportError as exc:
                raise CommandError(
                    "websockets paketi yok; `pip install websockets` veya --loop kullan."
                ) from exc
            return

        if options["loop"]:
            self._rest_loop(interval=options["interval"])
            return

        result = run_rest_poll_once(kaynak="api")
        # Tek sembol (GBP 0 book vb.) tüm ingest'i düşürmesin; metal yazıldıysa OK.
        metal_ok = any(str(p).startswith("metal:") for p in (result.persisted or []))
        if not result.persisted and not result.ticks:
            raise CommandError(
                "; ".join(result.errors + result.rejected) or "Ingest başarısız."
            )
        style = self.style.SUCCESS if (result.ok or metal_ok) else self.style.WARNING
        self.stdout.write(
            style(
                f"ok={result.ok} ticks={len(result.ticks)} "
                f"persisted={result.persisted} rejected={len(result.rejected)} "
                f"gram={result.gram_alis}/{result.gram_satis}"
            )
        )
        for r in result.rejected:
            self.stdout.write(self.style.WARNING(r))
        for e in result.errors:
            self.stdout.write(self.style.ERROR(e))

    def _rest_loop(self, *, interval: float):
        from django.db import close_old_connections

        self.stdout.write(f"REST poll loop interval={interval}s (Ctrl+C durdur)")
        self.stdout.flush()
        while True:
            close_old_connections()
            try:
                result = run_rest_poll_once(kaynak="api")
                self.stdout.write(
                    f"ok={result.ok} ticks={len(result.ticks)} "
                    f"persisted={result.persisted} rejected={len(result.rejected)}"
                )
                self.stdout.flush()
            except Exception as exc:  # noqa: BLE001
                self.stderr.write(self.style.ERROR(str(exc)))
                self.stderr.flush()
            time.sleep(max(0.5, interval))

    async def _ws_loop(self, *, interval: float):
        """Minimal WS: kopunca backoff; tick apply + periyodik persist."""
        import json

        import websockets
        from django.conf import settings
        from django.db import close_old_connections

        from tanimlar.services.ingest.pipeline import apply_tick, persist_derived
        from tanimlar.services.providers.base import BookTicker

        cfg = getattr(settings, "PIYASA_BINANCE", {}) or {}
        symbols = cfg.get("symbols") or {}
        fut_streams = []
        spot_streams = []
        for sym, meta in symbols.items():
            role = (meta or {}).get("role") or ""
            if str(role).startswith("ons_au_backup"):
                continue
            stream = f"{sym.lower()}@bookTicker"
            if (meta or {}).get("market") == "futures":
                fut_streams.append(stream)
            else:
                spot_streams.append(stream)

        backoff = 1.0
        while True:
            close_old_connections()
            try:
                urls = []
                if fut_streams:
                    urls.append(
                        f"{cfg.get('futures_ws')}?streams={'/'.join(fut_streams)}"
                    )
                if spot_streams:
                    urls.append(
                        f"{cfg.get('spot_ws')}?streams={'/'.join(spot_streams)}"
                    )

                async def _consume(url: str):
                    async with websockets.connect(url, ping_interval=20) as ws:
                        nonlocal backoff
                        backoff = 1.0
                        last_persist = 0.0
                        async for raw in ws:
                            close_old_connections()
                            msg = json.loads(raw)
                            data = msg.get("data") or msg
                            sym = (data.get("s") or "").upper()
                            if not sym:
                                continue
                            tick = BookTicker(
                                symbol=sym,
                                bid=__import__("decimal").Decimal(str(data["b"])),
                                ask=__import__("decimal").Decimal(str(data["a"])),
                                event_time_ms=data.get("E") or data.get("T"),
                            )
                            ok, reason = apply_tick(tick, source="binance")
                            if not ok:
                                self.stderr.write(reason)
                            now = time.monotonic()
                            if now - last_persist >= max(1.0, interval):
                                persist_derived(kaynak="websocket")
                                last_persist = now

                await asyncio.gather(*[_consume(u) for u in urls])
            except Exception as exc:  # noqa: BLE001
                self.stderr.write(self.style.ERROR(f"WS kopuşu: {exc}; backoff={backoff}s"))
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60.0)
