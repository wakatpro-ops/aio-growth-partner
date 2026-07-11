type LoadingStateProps = {
  title?: string;
  description?: string;
};

export function LoadingState({
  title = "店舗情報を整理しています",
  description = "AIが店舗データを読み込み、次に表示する内容を準備しています。"
}: LoadingStateProps) {
  return (
    <section className="loading-panel" aria-live="polite">
      <div className="loading-mark" aria-hidden="true" />
      <div>
        <p className="muted">読み込み中</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </section>
  );
}
