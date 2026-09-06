"use client";

import { useActionState } from "react";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import type { LineCodeActionState } from "@/app/stores/[storeId]/bookings/line/actions";

const initialState: LineCodeActionState = { ok: false, message: "" };

export function LineStoreLinkCode({ action }: { action: (previous: LineCodeActionState) => Promise<LineCodeActionState> }) {
  const [state, formAction] = useActionState(action, initialState);
  return <div className="line-link-code-panel">
    <form action={formAction}>
      <PendingSubmitButton pendingLabel="コードを発行しています...">新しい連携コードを発行</PendingSubmitButton>
    </form>
    {state.message ? <p className={`notice ${state.ok ? "success" : "danger"}`}>{state.message}</p> : null}
    {state.ok && state.code ? <div className="line-link-code-result" aria-live="polite">
      <span>お客様へ案内するコード</span>
      <strong>{state.code}</strong>
      <p>LINE公式アカウント「AIOBoostサポート」へこの8文字を送ってもらいます。1回だけ利用でき、15分で失効します。</p>
    </div> : null}
  </div>;
}

