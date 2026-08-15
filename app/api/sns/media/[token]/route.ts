import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createSupabaseAdminClient();
  if (!supabase || !/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data: asset } = await supabase.from("image_caption_jobs").select("storage_bucket,storage_path,mime_type,approval_status,archived_at").eq("public_token", token).maybeSingle();
  if (!asset || asset.archived_at || asset.approval_status !== "approved" || !asset.storage_path) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data, error } = await supabase.storage.from(asset.storage_bucket || "sns-media").download(asset.storage_path);
  if (error || !data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return new NextResponse(await data.arrayBuffer(), { headers: { "Content-Type": asset.mime_type || "application/octet-stream", "Cache-Control": "public, max-age=300, stale-while-revalidate=600", "X-Content-Type-Options": "nosniff" } });
}
