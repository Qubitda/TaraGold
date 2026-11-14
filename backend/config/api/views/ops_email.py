"""Admin E-posta (SMTP) Yapılandırma API — yalnız admin yetkisi, parola response'ta asla dönmez."""

from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.authentication import enforce_csrf
from api.permissions import IsAuthenticatedWithFirma
from api.throttles import OpsRateThrottle, SmtpTestRateThrottle
from api.views.auth import _django_ve_to_drf
from bildirim.models import SmtpSettings
from bildirim.services import smtp_servisi
from firmalar.role_permissions import P
from firmalar.services.audit_servisi import domain_atomic, record_audit
from firmalar.services.yetki_servisi import has_perm, is_platform_firm_user


def _is_smtp_admin(user) -> bool:
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False) and getattr(user, "is_staff", False):
        return True
    return is_platform_firm_user(user) and has_perm(user, P["manage_smtp"])


def _require_smtp_admin(user) -> None:
    if not _is_smtp_admin(user):
        raise PermissionDenied(
            detail="E-posta (SMTP) ayarları yalnızca yetkili platform yöneticilerine açıktır."
        )


def _parse_bool(val, default: bool = False) -> bool:
    if val is None:
        return default
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.strip().lower() in ("1", "true", "yes", "evet", "on")
    return bool(val)


def _present_email_config(cfg: SmtpSettings) -> dict:
    updated_by_username = ""
    if cfg.updated_by_id and getattr(cfg, "updated_by", None) is not None:
        updated_by_username = cfg.updated_by.get_username()
    return {
        "host": cfg.host or "",
        "port": int(cfg.port or 587),
        "username": cfg.username or "",
        "has_password": smtp_servisi.password_is_set(cfg),
        "encryption": cfg.encryption,
        "use_tls": bool(cfg.use_tls),
        "use_ssl": bool(cfg.use_ssl),
        "timeout": int(cfg.timeout or 15),
        "from_email": cfg.from_email or "",
        "from_name": cfg.from_name or "",
        "reply_to": cfg.reply_to or "",
        "is_active": bool(cfg.enabled),
        "enabled": bool(cfg.enabled),
        "last_test_at": cfg.last_test_at.isoformat() if cfg.last_test_at else None,
        "last_test_success": cfg.last_test_success,
        "last_test_message": cfg.last_test_message or "",
        "updated_by": cfg.updated_by_id,
        "updated_by_username": updated_by_username,
        "updated_at": cfg.guncelleme_tarihi.isoformat()
        if cfg.guncelleme_tarihi
        else None,
    }


def _update_config(request) -> dict:
    _require_smtp_admin(request.user)
    enforce_csrf(request)
    body = request.data if isinstance(request.data, dict) else {}
    cfg = SmtpSettings.get_solo()

    try:
        with domain_atomic():
            if "host" in body and body.get("host") is not None:
                cfg.host = str(body["host"]).strip()[:255]
            if "port" in body and body.get("port") not in (None, ""):
                try:
                    cfg.port = int(body["port"])
                except (TypeError, ValueError) as exc:
                    raise ValidationError({"port": "Port geçerli bir tamsayı olmalıdır."}) from exc
            if "timeout" in body and body.get("timeout") not in (None, ""):
                try:
                    cfg.timeout = int(body["timeout"])
                except (TypeError, ValueError) as exc:
                    raise ValidationError(
                        {"timeout": "Zaman aşımı geçerli bir tamsayı olmalıdır."}
                    ) from exc
            if "username" in body and body.get("username") is not None:
                cfg.username = str(body["username"]).strip()[:255]
            if "password" in body:
                smtp_servisi.set_password(cfg, body.get("password"))
            if "use_tls" in body or "use_ssl" in body:
                use_tls = _parse_bool(body.get("use_tls"), default=cfg.use_tls)
                use_ssl = _parse_bool(body.get("use_ssl"), default=cfg.use_ssl)
                cfg.apply_tls_ssl_flags(use_tls=use_tls, use_ssl=use_ssl)
            elif "encryption" in body and body.get("encryption"):
                enc = str(body["encryption"]).strip().upper()
                if enc not in ("NONE", "STARTTLS", "SSL"):
                    raise ValidationError({"encryption": "Geçersiz şifreleme seçimi."})
                cfg.encryption = enc
            if "from_name" in body and body.get("from_name") is not None:
                cfg.from_name = str(body["from_name"]).strip()[:120]
            if "from_email" in body and body.get("from_email") is not None:
                fe = str(body["from_email"]).strip()[:254]
                if fe:
                    validate_email(fe)
                cfg.from_email = fe
            if "reply_to" in body and body.get("reply_to") is not None:
                rt = str(body["reply_to"]).strip()[:254]
                if rt:
                    validate_email(rt)
                cfg.reply_to = rt
            if "is_active" in body:
                cfg.enabled = _parse_bool(body.get("is_active"), default=cfg.enabled)
            elif "enabled" in body:
                cfg.enabled = _parse_bool(body.get("enabled"), default=cfg.enabled)

            cfg.updated_by = request.user
            cfg.save()
            presented = _present_email_config(cfg)
            record_audit(
                actor=request.user,
                action="bildirim.smtp.updated",
                entity_type="SmtpSettings",
                entity_id=str(cfg.pk),
                success=True,
                detail={
                    "host": cfg.host,
                    "port": cfg.port,
                    "encryption": cfg.encryption,
                    "is_active": bool(cfg.enabled),
                    "has_password": smtp_servisi.password_is_set(cfg),
                },
            )
    except DjangoValidationError as exc:
        raise _django_ve_to_drf(exc) from exc

    return presented


class OpsEmailSettingsView(APIView):
    """GET / PUT / PATCH /api/v1/ops/email-settings/."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        _require_smtp_admin(request.user)
        cfg = SmtpSettings.get_solo()
        return Response(_present_email_config(cfg))

    def put(self, request):
        return Response(_update_config(request))

    def patch(self, request):
        return Response(_update_config(request))


class OpsEmailTestConnectionView(APIView):
    """POST /api/v1/ops/email-settings/test-connection/ — kaydetmeden de test eder."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [SmtpTestRateThrottle]

    def post(self, request):
        _require_smtp_admin(request.user)
        enforce_csrf(request)
        body = request.data if isinstance(request.data, dict) else {}
        try:
            result = smtp_servisi.test_smtp_connection(body)
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc

        record_audit(
            actor=request.user,
            action="bildirim.smtp.test_connection",
            entity_type="SmtpSettings",
            entity_id="1",
            success=bool(result.get("success")),
            detail={"message": result.get("message", "")},
        )
        return Response(result)


class OpsEmailSendTestView(APIView):
    """POST /api/v1/ops/email-settings/send-test/ — { to, ...formOverrides }."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [SmtpTestRateThrottle]

    def post(self, request):
        _require_smtp_admin(request.user)
        enforce_csrf(request)
        body = request.data if isinstance(request.data, dict) else {}
        to_email = str(body.get("to") or "").strip()
        try:
            result = smtp_servisi.send_test_email(
                to_email=to_email,
                overrides=body,
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc

        record_audit(
            actor=request.user,
            action="bildirim.smtp.test_send",
            entity_type="SmtpSettings",
            entity_id="1",
            success=bool(result.get("success")),
            detail={"to": to_email, "message": result.get("message", "")},
        )
        return Response(result)
