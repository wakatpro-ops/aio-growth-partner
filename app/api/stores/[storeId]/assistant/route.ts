import { NextResponse } from "next/server";
import { z } from "zod";
import { getStoreForApi } from "@/lib/stores";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { generateStoreAssistantAnswer } from "@/lib/store-ai/assistant";
import { loadStoreAiContext } from "@/lib/store-ai/context";
import { publicContext, resolveAiPage } from "@/lib/store-ai/context-rules";

export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
const pageSchema = z.object({ pathname: z.string().max(500), search: z.string().max(1500).default("") });

const schema = pageSchema.extend({
  message: z.string().trim().min(1).max(800),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(1200), pageLabel: z.string().max(80).optional() })).max(24).default([])
});

export async function GET(request: Request, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const access = await getStoreForApi(storeId);
  if (!access.ok) return NextResponse.json({ error: "店舗を確認できませんでした。" }, { status: access.status, headers });
  const parsed = pageSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "画面を確認してください。" }, { status: 400, headers });
  try { resolveAiPage(storeId, parsed.data.pathname, parsed.data.search); }
  catch { return NextResponse.json({ error: "対象店舗の画面を指定してください。" }, { status: 400, headers }); }
  try {
    return NextResponse.json(publicContext(await loadStoreAiContext(access.store, parsed.data.pathname, parsed.data.search)), { headers });
  } catch { return NextResponse.json({ error: "画面の情報を取得できませんでした。" }, { status: 503, headers }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const access = await getStoreForApi(storeId);
  if (!access.ok) return NextResponse.json({ error: access.status === 401 ? "ログインが必要です。" : "店舗を確認できませんでした。" }, { status: access.status, headers });
  const user = await getCurrentUserAccess();
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401, headers });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "質問内容を確認してください。" }, { status: 400, headers });
  try { resolveAiPage(storeId, parsed.data.pathname, parsed.data.search); }
  catch { return NextResponse.json({ error: "対象店舗の画面を指定してください。" }, { status: 400, headers }); }
  try {
    const context = await loadStoreAiContext(access.store, parsed.data.pathname, parsed.data.search);
    const { answer, model } = await generateStoreAssistantAnswer(context, parsed.data, {
      storeId: access.store.id,
      organizationId: access.store.organization_id,
      userId: user.userId
    });
    return NextResponse.json({ answer, model, context: publicContext(context) }, { headers });
  } catch {
    return NextResponse.json({ error: "AIの回答を取得できませんでした。時間をおいてもう一度送信してください。" }, { status: 503, headers });
  }
}
