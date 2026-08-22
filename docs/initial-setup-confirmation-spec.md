# AI初期設定の確認・正式反映

GitHub Issue: #52

## フロー

1. 公開URLをAIが解析し、原本を`public_store_analyses`へ保存する。
2. メール確認、正式申込、株式会社 Navi Lifeによる申込者・利用権限の審査を行う。
3. 電子契約・入金確認後に組織、店舗、店舗オーナーのアカウントを発行する。
4. 初回ログインで`/onboarding/setup-review?storeId=...`を開く。
5. 店舗オーナーが店舗情報、メニュー候補、請求書情報、業種別管理画面を確認・編集する。
6. 「この内容で利用を開始する」で選択内容だけを正式反映する。
7. 最初のAIO改善1件へ進む。

## データ境界

- AI解析原本と申込時snapshotは上書き・削除しない。
- 確定前のメニュー候補は`items`へ登録しない。
- 確定内容は`onboarding_snapshots.confirmation_payload`へ保存する。
- `confirmed_by`と`confirmed_at`を保存し、監査ログを記録する。
- メニューは`store_id + onboarding_source_key`で一意にし、再送信でも重複登録しない。
- 登録番号、税区分、価格はAIで推測しない。利用者が確認した値だけを反映する。

## 権限

- 確定できるのは、activeな認証セッションを持つ対象組織の`org_owner`だけ。
- 未所属、他組織、viewer、staff、store_manager、platform_adminからの確定を拒否する。
- 読み取り可能であっても、確定権限は別に検査する。

## 失敗・再試行

- `pending -> applying -> completed`で多重実行を抑止する。
- 途中エラー時は`pending`へ戻し、同じ候補キーで安全に再実行する。
- 完了後の再実行は新しいメニューを作らず、完了済みとして扱う。
