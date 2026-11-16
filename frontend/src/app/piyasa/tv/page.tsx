import { RequireAuth } from "@/features/auth";
import { PiyasaPanoPage } from "@/features/piyasa";

/** Menüsüz TV/yansıtma penceresi — ikinci monitörde tam ekran. */
export default function PiyasaTvPage() {
  return (
    <RequireAuth>
      <PiyasaPanoPage variant="tv" />
    </RequireAuth>
  );
}
