"""ADR-0039 ingest: tick cache, anomali, throttle persist."""

from tanimlar.services.ingest.pipeline import (
    IngestResult,
    apply_tick,
    ensure_fresh_feed_for_read,
    run_rest_poll_once,
)
from tanimlar.services.ingest.tick_store import get_tick, set_tick

__all__ = [
    "IngestResult",
    "apply_tick",
    "ensure_fresh_feed_for_read",
    "get_tick",
    "run_rest_poll_once",
    "set_tick",
]
