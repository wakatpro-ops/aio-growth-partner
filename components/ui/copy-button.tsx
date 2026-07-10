"use client";

import { useState } from "react";

export function CopyButton({ value, label = "コピー" }: { value: string | null | undefined; label?: string }) {
  const [copied, setCopied] = useState(false);
  const disabled = !value;

  return (
    <button
      className="button secondary"
      type="button"
      disabled={disabled}
      onClick={async () => {
        if (!value) return;
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? "コピー済み" : label}
    </button>
  );
}
