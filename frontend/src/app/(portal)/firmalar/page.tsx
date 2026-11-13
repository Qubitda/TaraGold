import { FirmalarOrgView } from "@/features/firmalar";
import { OpsFirmalarView } from "@/features/firmalar/components/ops-firmalar-view";
import { useAuthContext } from "@/features/auth/components/auth-provider";

export default function FirmalarPage() {
  const { user } = useAuthContext();
  const showOps = Boolean(user?.capabilities?.can_view_ops);

  return (
    <div className="space-y-10">
      {showOps ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Ops firmalar</h2>
          <OpsFirmalarView />
        </section>
      ) : null}
      <FirmalarOrgView />
    </div>
  );
}
