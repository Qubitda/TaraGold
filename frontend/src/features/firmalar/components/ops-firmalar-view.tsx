"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActionToast } from "@/hooks/use-action-toast";
import {
  opsFirmalarService,
  type OpsApiAnahtar,
  type OpsFirma,
} from "../services/ops-firmalar";

export function OpsFirmalarView() {
  const toast = useActionToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [step, setStep] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [keyAd, setKeyAd] = useState("feed");
  const [lastPlaintext, setLastPlaintext] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    ad: "",
    firma_kodu: "",
    alici_mi: true,
    tedarikci_mi: false,
    email: "",
    rol: "firma_admin",
  });

  const listQ = useQuery({
    queryKey: ["ops-firmalar", q],
    queryFn: () => opsFirmalarService.list(q ? { q } : undefined),
  });

  const keysQ = useQuery({
    queryKey: ["ops-firma-api-keys", selectedId],
    queryFn: () => opsFirmalarService.listApiAnahtarlar(selectedId!),
    enabled: selectedId != null,
  });

  const createM = useMutation({
    mutationFn: async () => {
      const f = await opsFirmalarService.create({
        ad: draft.ad,
        firma_kodu: draft.firma_kodu,
        alici_mi: draft.alici_mi,
        tedarikci_mi: draft.tedarikci_mi,
        tipler: [
          ...(draft.alici_mi ? ["ALICI_KUYUMCU"] : []),
          ...(draft.tedarikci_mi ? ["TEDARIKCI"] : []),
        ],
      });
      if (draft.email) {
        await opsFirmalarService.davet(f.id, {
          email: draft.email,
          rol: draft.rol,
        });
      }
      return f;
    },
    onSuccess: () => {
      toast.success("Firma oluşturuldu");
      setStep(0);
      qc.invalidateQueries({ queryKey: ["ops-firmalar"] });
    },
    onError: (e: Error) => toast.error("Kayıt başarısız", e.message),
  });

  const onayM = useMutation({
    mutationFn: (id: number) => opsFirmalarService.onayla(id),
    onSuccess: () => {
      toast.success("Firma onaylandı");
      qc.invalidateQueries({ queryKey: ["ops-firmalar"] });
    },
    onError: (e: Error) => toast.error("Onay başarısız", e.message),
  });

  const createKeyM = useMutation({
    mutationFn: () =>
      opsFirmalarService.createApiAnahtar(selectedId!, {
        ad: keyAd || "feed",
        scopes: ["feed:read"],
      }),
    onSuccess: (row: OpsApiAnahtar) => {
      toast.success("API anahtarı oluşturuldu", "Plaintext yalnız bir kez gösterilir");
      setLastPlaintext(row.api_key ?? null);
      qc.invalidateQueries({ queryKey: ["ops-firma-api-keys", selectedId] });
    },
    onError: (e: Error) => toast.error("Anahtar oluşturulamadı", e.message),
  });

  const iptalKeyM = useMutation({
    mutationFn: (anahtarId: number) =>
      opsFirmalarService.iptalApiAnahtar(selectedId!, anahtarId),
    onSuccess: () => {
      toast.success("API anahtarı iptal edildi");
      qc.invalidateQueries({ queryKey: ["ops-firma-api-keys", selectedId] });
    },
    onError: (e: Error) => toast.error("İptal başarısız", e.message),
  });

  const rows: OpsFirma[] = listQ.data?.results ?? [];
  const keys: OpsApiAnahtar[] = keysQ.data ?? [];
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label className="text-sm text-muted-foreground">Ara</label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ad / kod" />
        </div>
        <Button type="button" onClick={() => setStep(1)}>
          Yeni firma
        </Button>
      </div>

      {step > 0 ? (
        <div className="space-y-4 border-t pt-4">
          <p className="text-sm text-muted-foreground">Adım {step}/4</p>
          {step === 1 && (
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.alici_mi}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, alici_mi: e.target.checked }))
                  }
                />
                Alıcı
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.tedarikci_mi}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, tedarikci_mi: e.target.checked }))
                  }
                />
                Tedarikçi
              </label>
            </div>
          )}
          {step === 2 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm text-muted-foreground">Ad</label>
                <Input
                  value={draft.ad}
                  onChange={(e) => setDraft((d) => ({ ...d, ad: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Kod</label>
                <Input
                  value={draft.firma_kodu}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, firma_kodu: e.target.value }))
                  }
                />
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm text-muted-foreground">Davet e-posta</label>
                <Input
                  value={draft.email}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, email: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Rol</label>
                <Input
                  value={draft.rol}
                  onChange={(e) => setDraft((d) => ({ ...d, rol: e.target.value }))}
                />
              </div>
            </div>
          )}
          {step === 4 && (
            <p className="text-sm text-muted-foreground">
              {draft.ad} / {draft.firma_kodu} — kaydı onaylayın.
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(0)}>
              İptal
            </Button>
            {step > 1 ? (
              <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
                Geri
              </Button>
            ) : null}
            {step < 4 ? (
              <Button type="button" onClick={() => setStep((s) => s + 1)}>
                İleri
              </Button>
            ) : (
              <Button
                type="button"
                disabled={createM.isPending}
                onClick={() => createM.mutate()}
              >
                Kaydet + davet
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kod</TableHead>
            <TableHead>Ad</TableHead>
            <TableHead>Durum</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((f) => (
            <TableRow
              key={f.id}
              className={selectedId === f.id ? "bg-muted/40" : undefined}
            >
              <TableCell className="font-mono text-sm">{f.firma_kodu}</TableCell>
              <TableCell>{f.ad}</TableCell>
              <TableCell>{f.durum}</TableCell>
              <TableCell className="space-x-2 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelectedId(f.id);
                    setLastPlaintext(null);
                  }}
                >
                  API anahtarları
                </Button>
                {f.durum !== "AKTIF" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={onayM.isPending}
                    onClick={() => onayM.mutate(f.id)}
                  >
                    Onayla
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectedId != null ? (
        <div className="space-y-4 border-t pt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">
                Feed API anahtarları
                {selected ? ` — ${selected.ad}` : ""}
              </h2>
              <p className="text-xs text-muted-foreground">
                Plaintext yalnız oluşturma anında; sonra yalnız prefix görünür.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedId(null);
                setLastPlaintext(null);
              }}
            >
              Kapat
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-sm text-muted-foreground">Anahtar adı</label>
              <Input
                value={keyAd}
                onChange={(e) => setKeyAd(e.target.value)}
                className="w-40"
              />
            </div>
            <Button
              type="button"
              disabled={createKeyM.isPending}
              onClick={() => createKeyM.mutate()}
            >
              Yeni anahtar
            </Button>
          </div>

          {lastPlaintext ? (
            <p className="rounded-md border border-border bg-muted/30 p-3 font-mono text-xs break-all">
              {lastPlaintext}
            </p>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell>{k.ad}</TableCell>
                  <TableCell className="font-mono text-sm">{k.key_prefix}</TableCell>
                  <TableCell>{k.iptal ? "iptal" : "aktif"}</TableCell>
                  <TableCell className="text-right">
                    {!k.iptal ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={iptalKeyM.isPending}
                        onClick={() => iptalKeyM.mutate(k.id)}
                      >
                        İptal et
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {!keys.length && !keysQ.isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    Anahtar yok.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
