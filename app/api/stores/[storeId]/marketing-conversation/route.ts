import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { mayEditStore } from "@/lib/auth/access-policy";
import { getStoreForApi } from "@/lib/stores";
import { advanceConversation, readConversation, conversationEnabled, ConversationError } from "@/lib/marketing/conversation";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
const command = z.object({ revision: z.number().int().min(0), action: z.enum(["start", "answer", "generate", "edit", "cancel", "defer", "alternative", "open"]), value: z.string().trim().max(800).optional(), itemId: z.string().uuid().optional() }).strict();
async function handle(request: Request, params: Promise<{ storeId: string }>, write: boolean) {
  if (write && (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/json"))) return NextResponse.json({ error: "送信元を確認できません。" }, { status: 403, headers });
  const { storeId } = await params;
  const [access, actor] = await Promise.all([getStoreForApi(storeId), getCurrentUserAccess()]);
  if (!access.ok || !actor) return NextResponse.json({ error: "店舗にアクセスできません。" }, { status: !access.ok ? access.status : 401, headers });
  if (!conversationEnabled(access.store) || !mayEditStore(actor, storeId, access.store.organization_id)) return NextResponse.json({ error: "この店舗で下書きを作成する権限がありません。", unavailable: true }, { status: 403, headers });
  try {
    if (!write) return NextResponse.json(await readConversation(access.store, actor.userId), { headers });
    const input = command.safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ error: "入力を確認してください。" }, { status: 400, headers });
    return NextResponse.json(await advanceConversation(access.store, actor.userId, input.data), { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ConversationError ? error.message : "店舗の状況を取得できませんでした。未接続とは限りません。「再確認」してください。" }, { status: error instanceof ConversationError ? error.status : 503, headers });
  }
}
export async function GET(request: Request, { params }: { params: Promise<{ storeId: string }> }) { return handle(request, params, false); }
export async function POST(request: Request, { params }: { params: Promise<{ storeId: string }> }) { return handle(request, params, true); }
