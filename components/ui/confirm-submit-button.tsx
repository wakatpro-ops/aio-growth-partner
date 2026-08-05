"use client";

import type { MouseEvent } from "react";

type ConfirmSubmitButtonProps = {
  children: string;
  message: string;
  className?: string;
};

export function ConfirmSubmitButton({ children, message, className = "button danger" }: ConfirmSubmitButtonProps) {
  function confirmSubmit(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(message)) {
      event.preventDefault();
    }
  }

  return (
    <button className={className} type="submit" onClick={confirmSubmit}>
      {children}
    </button>
  );
}
