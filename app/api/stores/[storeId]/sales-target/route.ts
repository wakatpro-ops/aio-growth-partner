import { NextResponse } from "next/server";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { getStoreForApi } from "@/lib/stores";
import { menuPermissions } from "@/lib/menu-workbench-rules";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { salesPeriod, validSalesTarget } from "@/lib/sales/dashboard-rules";

const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request, { params }: { params: Promise<{ storeId: string }> }) {
  if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "送信元を確認できません。" }, { status: 403, headers });
  const { storeId } = await params;
  const [access, actor] = await Promise.all([getStoreForApi(storeId), getCurrentUserAccess()]);
  if (!access.ok || !actor) return NextResponse.json({ error: "店舗にアクセスできません。" }, { status: !access.ok ? access.status : 401, headers });
  if (!menuPermissions(actor, access.store.organization_id, storeId).manager) return NextResponse.json({ error: "目標を変更できるのは店長・オーナーです。" }, { status: 403, headers });
  const input = await request.json().catch(() => null);
  if (!input || input.month !== salesPeriod().month || (input.amount !== null && !validSalesTarget(input.amount))) return NextResponse.json({ error: "今月の目標を1〜1,000億円の整数で入力してください。" }, { status: 400, headers });
  const db = createSupabaseAdminClient();
  if (!db) return NextResponse.json({ error: "目標を保存できませんでした。" }, { status: 503, headers });
  const result = await db.rpc("save_sales_month_target", { p_actor: actor.userId, p_store: storeId, p_month: input.month, p_amount: input.amount });
  if (result.error) return NextResponse.json({ error: "目標を保存できませんでした。画面を開き直してお試しください。" }, { status: 503, headers });
  return NextResponse.json({ saved: true, amount: input.amount }, { headers });
}
