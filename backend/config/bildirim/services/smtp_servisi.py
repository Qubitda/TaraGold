"""SMTP okuma / test / hata sınıflandırma / gönderim — parola asla loglanmaz."""

from __future__ import annotations

import logging
import smtplib
import socket
import ssl
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from typing import Any

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail import EmailMultiAlternatives, get_connection
from django.core.validators import validate_email
from django.utils import timezone

from bildirim.models import SmtpSettings
from bildirim.services.crypto_servisi import seal_password, unseal_password

logger = logging.getLogger(__name__)

MASK = "******"


@dataclass(frozen=True)
class EffectiveSmtpConfig:
    host: str
    port: int
    username: str
    password: str
    use_tls: bool
    use_ssl: bool
    timeout: int
    from_name: str
    from_email: str
    reply_to: str
    is_active: bool


def get_or_create_singleton() -> SmtpSettings:
    return SmtpSettings.get_solo()


def set_password(smtp: SmtpSettings, plain: str | None) -> None:
    """Boş/None → mevcut sealed korunur; MASK → dokunma; diğer → şifrele."""
    if plain is None:
        return
    plain_str = str(plain)
    if plain_str.strip() == "" or plain_str.strip() == MASK:
        return
    smtp.password_sealed = seal_password(plain_str)


def password_is_set(smtp: SmtpSettings) -> bool:
    return bool(smtp.password_sealed)


def resolve_from_email(smtp: SmtpSettings | None = None) -> tuple[str, str]:
    smtp = smtp or get_or_create_singleton()
    email = (smtp.from_email or "").strip() or (
        getattr(settings, "DEFAULT_FROM_EMAIL", None) or "webmaster@localhost"
    )
    name = (smtp.from_name or "").strip()
    return name, email


def resolve_from_header(smtp: SmtpSettings | None = None) -> str:
    name, email = resolve_from_email(smtp)
    if name and email:
        return formataddr((name, email))
    return email


def _parse_bool(val: Any, default: bool = False) -> bool:
    if val is None:
        return default
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.strip().lower() in ("1", "true", "yes", "evet", "on")
    return bool(val)


def _parse_int(val: Any, *, field: str, min_val: int, max_val: int) -> int:
    try:
        parsed = int(val)
    except (TypeError, ValueError) as exc:
        raise ValidationError({field: f"Geçerli bir sayı girin ({min_val}-{max_val})."}) from exc
    if parsed < min_val or parsed > max_val:
        raise ValidationError(
            {field: f"Değer {min_val} ile {max_val} arasında olmalıdır."}
        )
    return parsed


def build_effective_config(
    overrides: dict[str, Any] | None = None,
    *,
    require_host: bool = True,
) -> EffectiveSmtpConfig:
    """Kaydedilmiş ayarlarla formdaki geçici alanları birleştirir (kaydetmeden test için)."""
    smtp = get_or_create_singleton()
    data = overrides if isinstance(overrides, dict) else {}

    host = (
        str(data["host"]).strip()
        if "host" in data and data["host"] is not None
        else (smtp.host or "").strip()
    )
    if require_host and not host:
        raise ValidationError({"host": "SMTP sunucu adresi (host) zorunludur."})

    port = (
        _parse_int(data["port"], field="port", min_val=1, max_val=65535)
        if "port" in data and data["port"] not in (None, "")
        else int(smtp.port or 587)
    )
    timeout = (
        _parse_int(data["timeout"], field="timeout", min_val=1, max_val=120)
        if "timeout" in data and data["timeout"] not in (None, "")
        else int(smtp.timeout or 15)
    )
    username = (
        str(data["username"]).strip()
        if "username" in data and data["username"] is not None
        else (smtp.username or "").strip()
    )

    if "use_tls" in data or "use_ssl" in data:
        use_tls = _parse_bool(data.get("use_tls"), default=smtp.use_tls)
        use_ssl = _parse_bool(data.get("use_ssl"), default=smtp.use_ssl)
        if use_tls and use_ssl:
            raise ValidationError(
                {"use_tls": "use_tls ve use_ssl aynı anda True olamaz."}
            )
    elif "encryption" in data and data["encryption"]:
        enc = str(data["encryption"]).strip().upper()
        if enc not in ("NONE", "STARTTLS", "SSL"):
            raise ValidationError({"encryption": "Geçersiz şifreleme modu."})
        use_tls = enc == "STARTTLS"
        use_ssl = enc == "SSL"
    else:
        use_tls = smtp.use_tls
        use_ssl = smtp.use_ssl

    raw_pw = data.get("password")
    if raw_pw is not None and str(raw_pw).strip() not in ("", MASK):
        password = str(raw_pw)
    else:
        password = unseal_password(smtp.password_sealed)

    from_name = (
        str(data["from_name"]).strip()
        if "from_name" in data and data["from_name"] is not None
        else (smtp.from_name or "").strip()
    )
    from_email = (
        str(data["from_email"]).strip()
        if "from_email" in data and data["from_email"] is not None
        else (smtp.from_email or "").strip()
    )
    if from_email:
        validate_email(from_email)
    else:
        from_email = getattr(settings, "DEFAULT_FROM_EMAIL", None) or "noreply@taragold.local"

    reply_to = (
        str(data["reply_to"]).strip()
        if "reply_to" in data and data["reply_to"] is not None
        else (smtp.reply_to or "").strip()
    )
    if reply_to:
        validate_email(reply_to)

    is_active = (
        _parse_bool(data.get("is_active", data.get("enabled")), default=smtp.enabled)
        if ("is_active" in data or "enabled" in data)
        else bool(smtp.enabled)
    )

    return EffectiveSmtpConfig(
        host=host,
        port=port,
        username=username,
        password=password,
        use_tls=use_tls,
        use_ssl=use_ssl,
        timeout=timeout,
        from_name=from_name,
        from_email=from_email,
        reply_to=reply_to,
        is_active=is_active,
    )


def _sanitize_detail(text: str, password: str = "") -> str:
    cleaned = (text or "").strip()
    if password and password in cleaned:
        cleaned = cleaned.replace(password, "***")
    return cleaned[:400]


def classify_smtp_error(exc: Exception, *, password: str = "") -> tuple[str, str]:
    """SMTP istisnasını kullanıcı dostu hata mesajı + güvenli detaya çevirir."""
    raw_detail = _sanitize_detail(f"{type(exc).__name__}: {exc}", password=password)

    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return (
            "SMTP kimlik doğrulaması başarısız (kullanıcı adı veya şifre hatalı).",
            raw_detail,
        )
    if isinstance(exc, ssl.SSLError):
        return (
            "SSL/TLS bağlantı hatası: seçilen şifreleme veya port sunucuyla uyumsuz.",
            raw_detail,
        )
    if isinstance(exc, smtplib.SMTPNotSupportedError):
        return (
            "SMTP sunucusu seçilen komutu (ör. STARTTLS veya kimlik doğrulama) desteklemiyor.",
            raw_detail,
        )
    if isinstance(exc, socket.gaierror):
        return (
            "DNS çözümleme hatası: SMTP sunucu adı bulunamadı.",
            raw_detail,
        )
    if isinstance(exc, (TimeoutError, socket.timeout)):
        return (
            "Bağlantı zaman aşımına uğradı: sunucu veya port erişilebilir değil.",
            raw_detail,
        )
    if isinstance(exc, ConnectionRefusedError):
        return (
            "Bağlantı reddedildi: sunucu belirtilen portta yanıt vermiyor.",
            raw_detail,
        )
    if isinstance(exc, (smtplib.SMTPRecipientsRefused, smtplib.SMTPSenderRefused)):
        return (
            "Gönderen veya alıcı e-posta adresi SMTP sunucusu tarafından reddedildi.",
            raw_detail,
        )
    if isinstance(exc, smtplib.SMTPException):
        return (
            "SMTP sunucusu ile iletişim sırasında hata oluştu.",
            raw_detail,
        )
    if isinstance(exc, OSError):
        return (
            "Ağ bağlantısı kurulamadı: güvenlik duvarı veya port erişimini kontrol edin.",
            raw_detail,
        )
    return ("E-posta testi sırasında beklenmeyen bir hata oluştu.", raw_detail)


def _open_smtp_client(cfg: EffectiveSmtpConfig):
    if cfg.use_ssl:
        server = smtplib.SMTP_SSL(cfg.host, cfg.port, timeout=cfg.timeout)
        server.ehlo()
    else:
        server = smtplib.SMTP(cfg.host, cfg.port, timeout=cfg.timeout)
        server.ehlo()
        if cfg.use_tls:
            server.starttls(context=ssl.create_default_context())
            server.ehlo()
    if cfg.username:
        server.login(cfg.username, cfg.password or "")
    return server


def test_smtp_connection(overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    """SMTP sunucusuna bağlanıp kimlik doğrulamayı test eder (kayıt şart değil)."""
    cfg = build_effective_config(overrides, require_host=True)
    server = None
    try:
        server = _open_smtp_client(cfg)
        server.noop()
        return {
            "success": True,
            "message": f"SMTP bağlantısı ve oturum açma başarılı ({cfg.host}:{cfg.port}).",
            "detail": None,
        }
    except Exception as exc:  # noqa: BLE001
        msg, detail = classify_smtp_error(exc, password=cfg.password)
        logger.warning(
            "smtp test_connection failed host=%s port=%s err=%s",
            cfg.host,
            cfg.port,
            type(exc).__name__,
        )
        return {
            "success": False,
            "message": msg,
            "detail": detail,
        }
    finally:
        if server is not None:
            try:
                server.quit()
            except Exception:  # noqa: BLE001
                pass


def send_test_email(
    *,
    to_email: str,
    overrides: dict[str, Any] | None = None,
    actor=None,
) -> dict[str, Any]:
    """Gerçek test e-postası gönderir ve last_test_* alanlarını günceller."""
    to_clean = (to_email or "").strip()
    if not to_clean:
        raise ValidationError({"to": "Alıcı e-posta adresi zorunludur."})
    validate_email(to_clean)

    has_override_host = isinstance(overrides, dict) and bool(
        str(overrides.get("host") or "").strip()
    )
    smtp = get_or_create_singleton()
    use_smtp_direct = has_override_host or bool((smtp.host or "").strip())

    result: dict[str, Any]
    if use_smtp_direct:
        cfg = build_effective_config(overrides, require_host=True)
        server = None
        try:
            server = _open_smtp_client(cfg)
            from_hdr = (
                formataddr((cfg.from_name, cfg.from_email))
                if cfg.from_name
                else cfg.from_email
            )
            mime = MIMEMultipart("alternative")
            mime["Subject"] = "TaraGold SMTP Test E-postası"
            mime["From"] = from_hdr
            mime["To"] = to_clean
            if cfg.reply_to:
                mime["Reply-To"] = cfg.reply_to
            mime.attach(
                MIMEText(
                    "TaraGold admin paneli üzerinden gönderilen SMTP test e-postasıdır.",
                    "plain",
                    "utf-8",
                )
            )
            mime.attach(
                MIMEText(
                    "<p><strong>TaraGold SMTP Test Başarılı</strong></p>"
                    "<p>Bu e-posta admin panelindeki SMTP yapılandırmasını doğrulamak için gönderilmiştir.</p>",
                    "html",
                    "utf-8",
                )
            )
            server.sendmail(cfg.from_email, [to_clean], mime.as_string())
            result = {
                "success": True,
                "message": f"Test e-postası başarıyla gönderildi ({to_clean}).",
                "detail": None,
            }
        except Exception as exc:  # noqa: BLE001
            msg, detail = classify_smtp_error(exc, password=cfg.password)
            logger.warning(
                "smtp send_test_email failed host=%s port=%s err=%s",
                cfg.host,
                cfg.port,
                type(exc).__name__,
            )
            result = {
                "success": False,
                "message": msg,
                "detail": detail,
            }
        finally:
            if server is not None:
                try:
                    server.quit()
                except Exception:  # noqa: BLE001
                    pass
    else:
        try:
            send_raw(
                to=[to_clean],
                subject="TaraGold SMTP Test E-postası (Varsayılan Backend)",
                body_html=(
                    "<p><strong>TaraGold E-posta Testi</strong></p>"
                    "<p>Aktif veritabanı SMTP kaydı olmadığından varsayılan e-posta backend'i kullanıldı.</p>"
                ),
            )
            result = {
                "success": True,
                "message": f"Test e-postası varsayılan backend ile gönderildi ({to_clean}).",
                "detail": None,
            }
        except Exception as exc:  # noqa: BLE001
            msg, detail = classify_smtp_error(exc)
            result = {
                "success": False,
                "message": msg,
                "detail": detail,
            }

    # last_test_* güncelle
    smtp.refresh_from_db()
    smtp.last_test_at = timezone.now()
    smtp.last_test_success = bool(result["success"])
    smtp.last_test_message = str(result["message"])[:500]
    if actor is not None and getattr(actor, "pk", None):
        smtp.updated_by = actor
    update_fields = [
        "last_test_at",
        "last_test_success",
        "last_test_message",
        "guncelleme_tarihi",
    ]
    if actor is not None and getattr(actor, "pk", None):
        update_fields.append("updated_by")
    smtp.save(update_fields=update_fields)
    return result


def send_raw(
    *,
    to: list[str],
    subject: str,
    body_html: str,
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
    reply_to: list[str] | None = None,
) -> None:
    """Ham HTML e-posta — DynamicDatabaseEmailBackend (veya test backend) üzerinden gider."""
    to = [e.strip() for e in (to or []) if e and str(e).strip()]
    if not to:
        raise ValidationError("Alıcı (to) zorunlu.")
    smtp = get_or_create_singleton()
    from_hdr = resolve_from_header(smtp)
    connection = get_connection()
    msg = EmailMultiAlternatives(
        subject=subject,
        body="",
        from_email=from_hdr,
        to=to,
        cc=[e for e in (cc or []) if e],
        bcc=[e for e in (bcc or []) if e],
        reply_to=reply_to or ([smtp.reply_to] if smtp.reply_to else None),
        connection=connection,
    )
    msg.attach_alternative(body_html, "text/html")
    try:
        msg.send(fail_silently=False)
    except Exception:
        logger.exception("smtp send_raw failed to_count=%s", len(to))
        raise


def test_connection(*, to_email: str) -> str:
    """Geriye uyum (Django admin action için); başarısızlıkta ValidationError atar."""
    res = send_test_email(to_email=to_email)
    if not res["success"]:
        raise ValidationError(res["message"])
    return "ok"
