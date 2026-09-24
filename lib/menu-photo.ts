import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
export async function menuPhotoMetadata(storeId:string,form:FormData,metadata:Record<string,unknown>={}) {
  const next={...metadata,tax_inclusion:String(form.get("tax_inclusion")??"inclusive")};
  if(form.get("remove_photo")==="on") for(const key of ["image_url","imageUrl","thumbnail_url","thumbnailUrl"]) delete (next as Record<string,unknown>)[key];
  const file=form.get("item_photo");
  if(!(file instanceof File)||!file.size) return next;
  if(file.size>3*1024*1024||!["image/jpeg","image/png","image/webp"].includes(file.type)) throw new Error("写真はJPG・PNG・WebP、3MBまでです。");
  const bytes=Buffer.from(await file.arrayBuffer());
  const valid=file.type==="image/jpeg"?bytes[0]===255&&bytes[1]===216:file.type==="image/png"?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";
  if(!valid) throw new Error("画像の形式を確認してください。");
  const db=createSupabaseAdminClient();if(!db)throw new Error("写真を保存できません。");
  const path=`${storeId}/${randomUUID()}.${file.type==="image/jpeg"?"jpg":file.type==="image/png"?"png":"webp"}`;
  const {error}=await db.storage.from("menu-images").upload(path,bytes,{contentType:file.type,upsert:false});
  if(error)throw new Error("写真を保存できませんでした。時間をおいてお試しください。");
  return {...next,image_url:db.storage.from("menu-images").getPublicUrl(path).data.publicUrl};
}
