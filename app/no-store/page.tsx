import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserAccess } from "@/lib/auth/server";

export default async function NoStorePage() {
  const access = await getCurrentUserAccess();
  if (!access) redirect("/login");
  if (access.isPlatformAdmin) redirect("/admin");

  const canAddStore = access.organizationIds.some((organizationId) => access.organizationRoles[organizationId] === "org_owner");

  return (
    <AppShell>
      <PageHeader
        eyebrow="利用店舗の確認"
        title="利用できる店舗がまだありません"
        description="アカウントは確認できましたが、現在利用できる店舗が割り当てられていません。"
      />
      <section className="card">
        <h2>{canAddStore ? "最初の店舗を登録してください" : "店舗オーナーまたは運営会社へご確認ください"}</h2>
        <p>{canAddStore ? "店舗を登録すると、店舗トップと必要な管理機能を利用できます。" : "担当店舗が割り当てられると、自動的にその店舗のトップから開始できます。"}</p>
        <div className="button-row">
          {canAddStore ? <Link className="button" href="/stores/new">店舗を追加</Link> : null}
          <Link className="button secondary" href="/help">操作方法を見る</Link>
          <Link className="button secondary" href="/settings">アカウント設定</Link>
        </div>
      </section>
    </AppShell>
  );
}
