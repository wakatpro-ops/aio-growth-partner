"use client";

export default function CustomerWorkbenchError({ reset }: { reset: () => void }) {
  return <section className="card" role="alert"><h2>予約・顧客の情報を表示できませんでした</h2><p>通信状態やアクセス権を確認して、もう一度お試しください。データが未登録という意味ではありません。</p><button type="button" className="button" onClick={reset}>再読み込み</button></section>;
}
