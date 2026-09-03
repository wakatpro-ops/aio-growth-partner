"use client";

import { useRef, useState } from "react";

type UploadAction = (formData: FormData) => void | Promise<void>;

const progressMessages = [
  "ファイルを安全に送信しています",
  "表とシートの構造を確認しています",
  "AIの整理結果を準備しています"
];

export function ImportUploadForm({ action }: { action: UploadAction }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);

  function startProgress() {
    setPending(true);
    setProgressIndex(0);
    window.setTimeout(() => setProgressIndex(1), 800);
    window.setTimeout(() => setProgressIndex(2), 2200);
  }

  return (
    <form className="card form" action={action} onSubmit={startProgress}>
      <h2>ファイルをアップロードして解析</h2>
      <p>ファイルの種類や列名が分からなくても構いません。AIO boostが内容を分類し、判断できないところだけ質問します。</p>
      <div
        className={`unified-import-dropzone${dragging ? " is-dragging" : ""}${fileName ? " has-file" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (!file || !inputRef.current) return;
          const transfer = new DataTransfer();
          transfer.items.add(file);
          inputRef.current.files = transfer.files;
          setFileName(file.name);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
      >
        <span className="unified-import-dropzone-icon" aria-hidden="true">⇧</span>
        <strong>{fileName || "CSV・Excel・PDFをここにドロップ"}</strong>
        <span>{fileName ? "クリックすると別のファイルを選べます" : "または、クリックしてファイルを選択"}</span>
        <input
          ref={inputRef}
          id="unified_file"
          name="file"
          type="file"
          accept=".csv,.tsv,.xlsx,.xls,.xlsm,.pdf,text/csv,application/pdf,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          hidden
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
        />
      </div>
      <ul className="compact-list">
        <li>20MB・合計50,000行まで、Excelは複数シートに対応します。</li>
        <li>マクロ付きExcel（XLSM）のマクロは実行せず、保存済みのセル値だけを読み取ります。</li>
        <li>人が確認して「取り込みを確定」するまで、売上・経費などの本データには反映しません。</li>
        <li>経費はfreeeへ送信せず、送信前の確認データとして保存します。</li>
      </ul>
      {pending ? (
        <div className="unified-import-progress" role="status" aria-live="polite">
          <span className="unified-import-spinner" aria-hidden="true" />
          <div><strong>{progressMessages[progressIndex]}</strong><p>ファイルの大きさによって少し時間がかかる場合があります。このままお待ちください。</p></div>
        </div>
      ) : null}
      <button className="button" type="submit" disabled={pending || !fileName} aria-disabled={pending || !fileName}>
        {pending ? "解析しています…" : "アップロードしてAI解析"}
      </button>
    </form>
  );
}
