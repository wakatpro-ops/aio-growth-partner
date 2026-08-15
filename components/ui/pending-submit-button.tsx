"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

type PendingSubmitButtonProps = {
  children: string;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  formAction?: ComponentProps<"button">["formAction"];
};

export function PendingSubmitButton({
  children,
  pendingLabel = "処理中...",
  className = "button",
  disabled = false,
  formAction
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button className={className} type="submit" disabled={disabled || pending} aria-busy={pending} formAction={formAction}>
      {pending ? pendingLabel : children}
    </button>
  );
}
