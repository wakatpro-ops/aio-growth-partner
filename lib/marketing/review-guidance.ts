/** Match the existing Google settings/OAuth feature gates; never enable them here. */
export function googleReviewIntegrationAvailable(flags: Record<string, boolean | undefined>) {
  return Boolean(flags.google_integrations && flags.google_oauth_connection && flags.google_business_profile_integration);
}

export function reviewGuidance(available: boolean, connected: boolean, unanswered: number) {
  if (!available) return "現在この店舗ではGoogle連携が利用対象外になっています。利用を希望する場合は、店舗の管理者に設定を確認してもらいましょう。保存済みの口コミは機能一覧から確認できます。";
  if (!connected) return `Googleの連携がまだ完了していないようです。口コミを管理できるよう、接続と対象店舗の選択を進めませんか？${unanswered ? `保存済みの未返信口コミは${unanswered}件です。` : ""}`;
  return unanswered ? `未返信の口コミが${unanswered}件あります。機能一覧を開いて、返信を準備しませんか？` : "取得済みの口コミに未返信はありません。必要なときに機能一覧から更新・履歴の確認ができます。";
}
