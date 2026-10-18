type Candidate = {
  name: string;
  unitPrice: number | null;
  taxInclusion: "inclusive" | "exclusive" | "unknown";
  sourceUrl: string;
  sourceAccess?: "page" | "search";
};

export function PublicMenuCandidates({ menus, status }: { menus: Candidate[]; status?: string }) {
  const safeMenus = menus.filter(menu => {
    try { const url = new URL(menu.sourceUrl); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; }
    catch { return false; }
  });
  return <section className="card stack" aria-label="公開情報の商品候補">
    <div><p className="step-label">商品・メニューの候補</p><h2>{safeMenus.length ? `具体的な商品を${safeMenus.length}件見つけました` : "商品の確認は、あとから続けられます"}</h2>
      <p>{safeMenus.length ? "掲載されている商品名と価格です。初期設定で内容を確認してから登録します。" : status === "unavailable" ? "店舗情報は確認できましたが、メニューの追加調査を完了できませんでした。別のメニューURLや資料から、あとで確認できます。" : "店舗情報は確認できましたが、具体的な商品名・価格を確認できる公開情報が見つかりませんでした。あとからメニュー表を取り込めます。"}</p></div>
    {safeMenus.length ? <ul className="public-menu-candidate-list">{safeMenus.map(menu => <li key={`${menu.sourceUrl}:${menu.name}`}>
      <div><strong>{menu.name}</strong><span>{menu.unitPrice === null ? "価格未確認" : `${menu.unitPrice.toLocaleString("ja-JP")}円`}{menu.unitPrice !== null ? menu.taxInclusion === "inclusive" ? "（税込）" : menu.taxInclusion === "exclusive" ? "（税抜）" : "（税区分未確認）" : ""}</span></div>
      <a href={menu.sourceUrl} target="_blank" rel="noopener noreferrer">出典を確認 ↗ <span className="muted">{menu.sourceAccess === "page" ? "本文を取得" : "検索で参照"}</span></a>
    </li>)}</ul> : null}
    {safeMenus.length ? <p className="muted">全メニューや現在の提供内容を保証するものではありません。この時点では商品登録・写真の取り込みは行いません。</p> : null}
  </section>;
}
