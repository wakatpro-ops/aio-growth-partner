import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const applicationSchema = z.object({
  industry_type_key: z.string().default("general_store"),
  store_name: z.string().min(1),
  contact_name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().default(""),
  store_count: z.coerce.number().int().positive().default(1),
  pain_points: z.string().min(1),
  message: z.string().optional().default("")
});

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = applicationSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "入力内容を確認してください。" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (supabase) {
    const { error } = await supabase.from("applications").insert({
      ...parsed.data,
      status: "new"
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
