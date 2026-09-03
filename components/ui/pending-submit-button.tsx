"use client";

import { useEffect, useState } from "react";
import type { ComponentProps, MouseEvent } from "react";
import { useFormStatus } from "react-dom";

type PendingSubmitButtonProps = {
  children: string;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  busy?: boolean;
  formAction?: ComponentProps<"button">["formAction"];
};

export function PendingSubmitButton({
  children,
  pendingLabel = "処理中...",
  className = "button",
  disabled = false,
  busy = false,
  formAction
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();
  const [clicked, setClicked] = useState(false);
  const isBusy = clicked || pending || busy;

  useEffect(() => {
    if (!clicked || pending || busy) return;
    const timeout = window.setTimeout(() => setClicked(false), 1200);
    return () => window.clearTimeout(timeout);
  }, [busy, clicked, pending]);

  function lockImmediately(event: MouseEvent<HTMLButtonElement>) {
    if (disabled || busy || pending || clicked) {
      event.preventDefault();
      return;
    }
    const form = event.currentTarget.form;
    if (form && !form.checkValidity()) return;
    setClicked(true);
  }

  return (
    <button className={className} type="submit" disabled={disabled || pending || busy} aria-disabled={isBusy} aria-busy={isBusy} formAction={formAction} onClick={lockImmediately}>
      {isBusy ? pendingLabel : children}
    </button>
  );
}
