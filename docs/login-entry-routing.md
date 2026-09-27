# ログイン先の役割別修正（2026-09-27）

## 原因

通常ログインと `/dashboard` が申込の `onboarding_status != completed` を初回ログインの代わりに判定していた。店舗を継続利用しても初期設定を途中保存した利用者は、毎回初期設定へ戻される。過去のログイン時の状態書戻しを止める修正だけでは、すでに未完了のレコードを持つ利用者を救済できなかった。

また、パスワード再設定APIも初期設定状態を `started` に書き戻していた。

## 修正する仕様

- 通常のメール・パスワードログイン、`/dashboard`、パスワード再設定後は、初期設定の未完了状態によって遷移先を変えない。
- 有効なAIO運営管理者は `/admin`。店舗履歴や所属があっても最優先。
- 店舗側の権限（法人オーナー・店長・スタッフ・閲覧者）は、担当店舗が1件なら店舗トップ。複数なら権限を再確認した前回店舗、前回店舗がなければ店舗選択。所属なしなら専用案内。
- 招待リンクから明示的に初期設定へ進むときだけ、申込本人・法人オーナー・有効な所属店舗・未完了の申込と確認待ちスナップショットをサーバーで照合して初期設定へ案内する。
- 店長・スタッフへオーナー用初期設定を要求しない。別法人・別店舗への権限を増やさない。
- 途中の初期設定内容は保持し、既存の「はじめての方へ」から任意に再開可能。完了したと偽ってDBを一括変更しない。
- 再ログイン・パスワード再設定は初期設定の状態を巻き戻さない。

## 検証

単体テストに加え、既存ステージングの一時合成データで、未完了オーナー／店長／スタッフ／閲覧者／複数店／未所属／停止／運営管理者、初回招待・通常ログイン・パスワード再設定・`/dashboard`を検証する。実利用者のパスワード変更、メール送信、本番の業務データ変更は行わない。

### 実行結果

- Issue: [#160](https://github.com/wakatpro-ops/aio-growth-partner/issues/160)
- `test:post-login` 9件、`test:authz-policy` 9件、login-session-policy単体3件成功。
- `check:auth-experience`、`check:initial-setup`、`check:instant-feedback`、lint、TypeScript、production build成功。
- `node scripts/test-role-login-staging.mjs --local`: 19テスト群成功。
- `node scripts/test-role-login-staging.mjs`: ステージングで21テスト群成功。通常ログインとdashboard、停止アカウント拒否、明示招待、別法人拒否、初期設定済み招待、実ブラウザの役割別ログイン、招待・再設定フォーム、進捗維持、複数店・無効店舗を検証。一時データの後片付けも成功。
- `LOGIN_TEST_BASE_URL=https://staging.aioboost.jp npx playwright test --config=playwright.login.config.ts`: 即時フィードバック、タイムアウト復旧、JavaScript無効時の保護、キーボード二重送信防止、遷移中のロック維持の5件成功。
- 画面確認幅: 店長・スタッフ390px、オーナー・閲覧者・運営管理者1440px。店舗側に管理者ナビゲーションなし、別店舗API拒否、管理画面アクセス拒否を確認。
- 検証デプロイ: `dpl_9xJ5Rh8dBL5CmzK3Hm3Q3EFPEp9N` / `staging.aioboost.jp`。本番反映結果はIssue/PRに追記する。
