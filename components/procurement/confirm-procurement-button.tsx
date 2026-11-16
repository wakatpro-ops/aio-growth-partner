'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PendingSubmitButton } from '@/components/ui/pending-submit-button';

export function ConfirmProcurementButton({ children, message, className = 'button danger' }: {
  children: ReactNode; message: string; className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const original = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (confirming) cancel.current?.focus();
    else if (returnFocus.current) original.current?.focus();
  }, [confirming]);
  return confirming ? <div className="procurement-confirm" role="group" aria-label={message}>
    <p>{message}</p>
    <div className="button-row">
      <button type="button" ref={cancel} className="button secondary" onClick={() => { returnFocus.current = true; setConfirming(false); }}>戻る</button>
      <PendingSubmitButton className={className} pendingLabel="処理中…">確認して進む</PendingSubmitButton>
    </div>
  </div> : <button type="button" ref={original} className={className} onClick={() => setConfirming(true)}>{children}</button>;
}
