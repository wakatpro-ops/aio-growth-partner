import { NextResponse } from "next/server";
import { getStore } from "@/lib/stores";

export async function GET(_: Request, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  await getStore(storeId);
  const header = "名前,会社名,電話番号,メールアドレス,住所,生年月日,性別,職業,担当者,LINE,Instagram,Facebook,最終来店日,来店回数,備考,タグ,顧客番号,希望連絡方法,メール配信許可,LINE配信許可,SNS配信許可,配信停止";
  const example = "山田 花子,株式会社サンプル,090-0000-0000,hanako@example.com,東京都杉並区,1990-01-31,女性,会社員,佐藤,@sample,@sample,,2026-08-01,3,アロマの香りが好み,アロマ・平日希望,C-0001,LINE,いいえ,はい,いいえ,いいえ";
  return new NextResponse(`\uFEFF${header}\n${example}\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="aio-boost-customer-import-template.csv"'
    }
  });
}
