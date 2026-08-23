import { NextResponse } from "next/server";
import { z } from "zod";
import { getStoreForApi } from "@/lib/stores";
import { generateStoreAssistantAnswer } from "@/lib/store-ai/assistant";

const schema = z.object({
  pathname: z.string().max(500),
  message: z.string().trim().min(1).max(800),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(1200) })).max(8).default([])
});

export async function POST(request: Request, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const access = await getStoreForApi(storeId);
  if (!access.ok) return NextResponse.json({ error: access.status === 401 ? "ログインが必要です。" : "店舗を確認できませんでした。" }, { status: access.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "質問内容を確認してください。" }, { status: 400 });
  return NextResponse.json({ answer: await generateStoreAssistantAnswer(access.store, parsed.data) });
}
