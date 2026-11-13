from django.contrib import admin, messages
from django.contrib.auth.models import Group
from django.core.exceptions import PermissionDenied, ValidationError

from firmalar.selectors.tenant import scope_queryset
from firmalar.services.firma_onay_servisi import onayla_firma
from firmalar.services.yetki_servisi import can_view_all_tenants

from ..models import (
    AliciKanalErisimi,
    Firma,
    FirmaAdresi,
    FirmaBankaHesabi,
    FirmaBelge,
    FirmaKontak,
    FirmaTedarikciAltTip,
    FirmaTipAtama,
    FirmaUyelik,
    TedarikciKanalIzni,
)

try:
    admin.site.unregister(Group)
except admin.sites.NotRegistered:
    pass


class FirmaAdresiInline(admin.TabularInline):
    model = FirmaAdresi
    extra = 0


class FirmaBankaHesabiInline(admin.TabularInline):
    model = FirmaBankaHesabi
    extra = 0
    fields = ("banka_adi", "iban", "swift_bic", "para_birimi", "aktif")


class FirmaKontakInline(admin.TabularInline):
    model = FirmaKontak
    extra = 0


class FirmaTipAtamaInline(admin.TabularInline):
    model = FirmaTipAtama
    extra = 0


class FirmaTedarikciAltTipInline(admin.TabularInline):
    model = FirmaTedarikciAltTip
    extra = 0


@admin.register(Firma)
class FirmaAdmin(admin.ModelAdmin):
    list_display = (
        "ad",
        "firma_kodu",
        "vergi_no",
        "alici_mi",
        "tedarikci_mi",
        "platform_mu",
        "durum",
        "onay_durumu",
        "aktif",
    )
    list_filter = (
        "alici_mi",
        "tedarikci_mi",
        "platform_mu",
        "durum",
        "onay_durumu",
        "aktif",
    )
    search_fields = ("ad", "unvan", "vergi_no", "firma_kodu")
    readonly_fields = ("onay_durumu", "aktif")
    inlines = [
        FirmaTipAtamaInline,
        FirmaTedarikciAltTipInline,
        FirmaKontakInline,
        FirmaAdresiInline,
        FirmaBankaHesabiInline,
    ]
    actions = ("action_onayla",)

    @admin.action(description="Seçili firmaları onayla (firma.approved outbox)")
    def action_onayla(self, request, queryset):
        ok = 0
        for firma in queryset:
            try:
                onayla_firma(actor=request.user, firma=firma)
                ok += 1
            except (PermissionDenied, ValidationError) as exc:
                self.message_user(request, f"{firma}: {exc}", level=messages.ERROR)
        if ok:
            self.message_user(request, f"{ok} firma onaylandı.", level=messages.SUCCESS)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if can_view_all_tenants(request.user):
            return qs
        if getattr(request.user, "firma_id", None):
            return qs.filter(pk=request.user.firma_id)
        return qs.none()


@admin.register(FirmaAdresi)
class FirmaAdresiAdmin(admin.ModelAdmin):
    list_display = ("firma", "tip", "il", "ilce", "varsayilan")
    list_filter = ("tip", "varsayilan")
    search_fields = ("firma__ad", "il", "ilce")
    list_select_related = ("firma",)
    autocomplete_fields = ("firma",)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return scope_queryset(qs, request.user, firma_field="firma_id")


@admin.register(FirmaBankaHesabi)
class FirmaBankaHesabiAdmin(admin.ModelAdmin):
    list_display = ("firma", "banka_adi", "iban", "swift_bic", "para_birimi", "aktif")
    list_filter = ("para_birimi", "aktif")
    search_fields = ("firma__ad", "banka_adi", "iban", "swift_bic")
    list_select_related = ("firma",)
    autocomplete_fields = ("firma",)
    fields = ("firma", "banka_adi", "iban", "swift_bic", "para_birimi", "aktif")

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return scope_queryset(qs, request.user, firma_field="firma_id")


@admin.register(FirmaUyelik)
class FirmaUyelikAdmin(admin.ModelAdmin):
    list_display = ("kullanici", "firma", "rol", "aktif", "olusturma")
    list_filter = ("aktif", "rol")
    search_fields = ("kullanici__username", "firma__ad", "firma__firma_kodu")
    list_select_related = ("kullanici", "firma")
    autocomplete_fields = ("kullanici", "firma")

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return scope_queryset(qs, request.user, firma_field="firma_id")


@admin.register(FirmaKontak)
class FirmaKontakAdmin(admin.ModelAdmin):
    list_display = ("ad_soyad", "firma", "gorev", "eposta", "telefon", "birincil")
    list_filter = ("birincil",)
    search_fields = ("ad_soyad", "eposta", "firma__ad")
    list_select_related = ("firma",)
    autocomplete_fields = ("firma",)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return scope_queryset(qs, request.user, firma_field="firma_id")


@admin.register(TedarikciKanalIzni)
class TedarikciKanalIzniAdmin(admin.ModelAdmin):
    list_display = (
        "tedarikci_firma",
        "satis_kanali",
        "durum",
        "talep_tarihi",
        "karar_tarihi",
    )
    list_filter = ("durum",)
    search_fields = ("tedarikci_firma__ad", "satis_kanali__ad")
    list_select_related = ("tedarikci_firma", "satis_kanali")
    autocomplete_fields = ("tedarikci_firma", "satis_kanali")

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if can_view_all_tenants(request.user):
            return qs
        return scope_queryset(qs, request.user, firma_field="tedarikci_firma_id")


@admin.register(AliciKanalErisimi)
class AliciKanalErisimiAdmin(admin.ModelAdmin):
    list_display = ("firma", "satis_kanali", "fiyat_grubu", "aktif")
    list_filter = ("aktif",)
    search_fields = ("firma__ad", "satis_kanali__ad", "fiyat_grubu__ad")
    list_select_related = ("firma", "satis_kanali", "fiyat_grubu")
    autocomplete_fields = ("firma", "satis_kanali", "fiyat_grubu")

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return scope_queryset(qs, request.user, firma_field="firma_id")


@admin.register(FirmaBelge)
class FirmaBelgeAdmin(admin.ModelAdmin):
    list_display = ("baslik", "tip", "firma", "olusturma")
    list_filter = ("tip",)
    search_fields = ("baslik", "firma__ad", "storage_key")
    list_select_related = ("firma",)
    autocomplete_fields = ("firma",)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return scope_queryset(qs, request.user, firma_field="firma_id")
