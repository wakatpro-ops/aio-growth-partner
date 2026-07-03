import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";

export default function NewStorePage() {
  return (
    <AppShell>
      <PageHeader title="店舗追加" description="Phase 1では画面構成を先に用意し、Supabase接続後に保存処理を有効化します。" />
      <form className="card form">
        <div className="grid cols-2">
          <div className="field">
            <label htmlFor="name">店舗名</label>
            <input id="name" name="name" />
          </div>
          <div className="field">
            <label htmlFor="industry">業態</label>
            <select id="industry" name="industry">
              <option value="general_store">汎用店舗</option>
              <option value="auto_repair">自動車修理</option>
            </select>
          </div>
        </div>
        <button className="button" type="button">保存</button>
      </form>
    </AppShell>
  );
}
