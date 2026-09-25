"use client";
import { AiRobotFace } from "@/components/brand/ai-robot";

export function AskAboutCustomers() {
  return <button type="button" className="button secondary" onClick={() => window.dispatchEvent(new CustomEvent("aio:ask", { detail: "予約・顧客画面の使い方と、登録済みの利用履歴をもとにしたフォローの進め方を教えてください。個人情報は使わず説明してください。" }))}><AiRobotFace /> AIに使い方を尋ねる</button>;
}
