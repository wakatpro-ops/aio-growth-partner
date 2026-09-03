"use client";

import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { useFormStatus } from "react-dom";

type ConfirmSubmitButtonProps = {
  children: string;
  message: string;
  className?: string;
};

export function ConfirmSubmitButton({ children, message, className = "button danger" }: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!confirmed || pending) return;
    const timeout = window.setTimeout(() => setConfirmed(false), 1200);
    return () => window.clearTimeout(timeout);
  }, [confirmed, pending]);

  function confirmSubmit(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (!window.confirm(message)) {
      return;
    }
    const form = event.currentTarget.form;
    setConfirmed(true);
    // React may apply the disabled state before the browser's default submit
    // action runs. Submit the form explicitly so confirmation never swallows
    // the requested operation.
    form?.requestSubmit();
  }

  return (
    <button className={className} type="submit" onClick={confirmSubmit} disabled={confirmed || pending} aria-busy={confirmed || pending}>
      {confirmed || pending ? "処理しています..." : children}
    </button>
  );
}
