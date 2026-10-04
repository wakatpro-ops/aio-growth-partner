"use client";
import { useActionState, useState } from "react";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
type SaveState = { error?: string; saved?: boolean };
export function AioDraftEditor({ body, questions, save }: { body: string; questions: boolean; save: (previous: SaveState, data: FormData) => Promise<SaveState> }) {
  const [state, action, pending] = useActionState(save, {});
  const [value, setValue] = useState(body);
  return <form className="card form" action={action} aria-busy={pending}>
    <h2>下書きを編集</h2>
    <p>まだ公開・反映していません。事実に合っているか確認して仕上げてください。</p>
    <div className="field"><label htmlFor="draft_body">{questions ? "目標質問の候補（1行に1件）" : "紹介文の下書き"}</label><textarea id="draft_body" name="draft_body" rows={8} maxLength={2000} required value={value} onChange={event => setValue(event.target.value)} readOnly={pending} /></div>
    {state.error ? <p className="notice danger" role="alert">{state.error}</p> : null}
    {state.saved ? <p className="notice success" role="status">下書きを保存しました。まだ公開・反映していません。</p> : null}
    <PendingSubmitButton pendingLabel="下書きを保存しています…">下書きを保存</PendingSubmitButton>
    <p className="muted">{questions ? "保存後、下の目標質問欄で確認してから登録できます。" : "保存した文章をコピーして、下の「元の情報を編集する」から店舗情報などへ反映できます。"}</p>
  </form>;
}
