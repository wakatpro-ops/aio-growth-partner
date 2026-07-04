"use client";

export function ReportPrintButton() {
  return (
    <button className="button secondary" type="button" onClick={() => globalThis.print()}>
      印刷プレビュー
    </button>
  );
}
