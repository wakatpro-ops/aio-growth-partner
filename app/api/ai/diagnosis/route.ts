import { NextResponse } from "next/server";
import { z } from "zod";
import { generateWithAi } from "@/lib/openai/generate";
import { getStore } from "@/lib/stores";

const schema = z.object({
  storeId: z.string().min(1),
  input: z.record(z.unknown())
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const store = await getStore(parsed.data.storeId);
  const result = await generateWithAi({
    store,
    templateKey: "aio_diagnosis",
    input: parsed.data.input,
    userId: null
  });

  return NextResponse.json(result, { status: result.log.status === "success" ? 200 : 500 });
}
