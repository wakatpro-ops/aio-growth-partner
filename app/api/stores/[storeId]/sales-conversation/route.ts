import { NextResponse } from "next/server";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { mayEditStore } from "@/lib/auth/access-policy";
import { getStoreForApi } from "@/lib/stores";
import { salesCommand } from "@/lib/sales/conversation-rules";
import { advanceSalesConversation, readSalesConversation, SalesConversationError } from "@/lib/sales/conversation";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
async function handle(request: Request, params: Promise<{ storeId: string }>, write: boolean) {
  if (write && (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/json"))) return NextResponse.json({ error: "送信元を確認できません。" }, { status: 403, headers });
  const { storeId } = await params;
  const [access, actor] = await Promise.all([getStoreForApi(storeId), getCurrentUserAccess()]);
  if (!access.ok || !actor) return NextResponse.json({ error: "店舗にアクセスできません。" }, { status: !access.ok ? access.status : 401, headers });
  if (!mayEditStore(actor, storeId, access.store.organization_id)) return NextResponse.json({ error: "下書きを作成する権限がありません。", unavailable: true }, { status: 403, headers });
  try {
    if (!write) return NextResponse.json(await readSalesConversation(access.store, actor.userId), { headers });
    const input = salesCommand.safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ error: "数量・金額などの入力を確認してください。" }, { status: 400, headers });
    return NextResponse.json(await advanceSalesConversation(access.store, actor.userId, input.data), { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof SalesConversationError ? error.message : "店舗の状況を取得できませんでした。「再確認」してください。データがないとは限りません。" }, { status: error instanceof SalesConversationError ? error.status : 503, headers });
  }
}
export async function GET(request: Request, { params }: { params: Promise<{ storeId: string }> }) { return handle(request, params, false); }
export async function POST(request: Request, { params }: { params: Promise<{ storeId: string }> }) { return handle(request, params, true); }
