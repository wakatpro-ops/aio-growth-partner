# 公開URL診断：店舗同定と再調査

## 範囲・原因（2026-10-08）

- 対象は `/apply` の申込前診断。既存店舗・顧客・売上・正式申込は変更しない。
- 本番 `public_store_analyses` の対象URLだけを読み取り。一休108403と食べログ13206799は10月7日/8日とも `http_403`、AI開始前の失敗。広告パラメーターなしでも同じ。手元の同じ取得処理は成功。接続元による拒否があるが、提供元の具体的なWAFルールは不明。プロキシ、ユーザーCookie、User-Agent偽装などで迂回しない。
- Instagram amourbymeeは `/accounts/login/` に転送され、タイトルInstagramの一般画面を取得。元の店舗を同定できない分岐が、検索候補に名前・住所があれば採用していた。長野と福岡の無関係な店舗が成功・highになったことを本番診断記録で確認。
- 診断画面に肯定チェックしかなく、同じURLで名前・地域を訂正できなかった。

## 修正

- 元ページの同定情報が弱いときは店舗名・地域の両方を要求。検索前と検索結果の採用前にサーバーで検査し、入力した名称・地域や取得済みの住所・電話との矛盾は拒否。
- ログイン画面を店舗情報として扱わない。403等の取得不可は空の証拠として保持し、利用者補足から別の公開情報を検索する。SSRF・秘密付きURL・非HTTP等の安全性拒否は救済検索しない。
- 検索の出典はツールcitation、またはモデルが選択したURLとツールの実際のsourcesが一致したもののみ。モデルJSONのURLだけでは照合済みとしない。読めなかった入力URLを情報源へ数えない。
- 元URLを読めず補足から検索した結果は「店舗候補」「元のURLとの一致は未確認」。検索情報源の数を本人確認の強度にしない。
- 「違います・店舗を訂正する」から名称・地域・必要ならURLを入力。新しい解析時に古いプレビューを破棄。
- 過去の未申込診断はpolicy versionで再診断を要求。既存正式申込や店舗に遡及変更はしない。メール送信・確認・正式申込にもサーバー側チェック。
- `ttps://` の限定的補正、媒体を特定した広告パラメーター除去。認証情報パラメーター拒否は維持。

## 検証

- `node --experimental-strip-types scripts/test-public-identity-recovery.mjs`
- `node --experimental-strip-types scripts/test-url-first-onboarding.mjs`
- `node scripts/check-url-first-onboarding.mjs`
- 型・対象lint・秘密値チェック・production build。
- 本番用保護済みAI設定を既存Vercel隔離Preview内で利用、DBだけ既存stagingに限定。秘密キーはファイル保存・出力しない。外部メール・申し込み・投稿は実行しない。
- 隔離Preview `dpl_9Q8RAVdoMxDaHWhn33pLK7NLrM8C` で実AIを検証。2026-10-08、一休108403は403→名前Natural kitchen yoomi・地域六本木→正しい候補（港区六本木7-17-19 3F、3出典）まで到達。元URL未確認・候補の表記を確認。
- 「違います」を押すと申込連絡先フォームが非表示。同フォームから `ttps://s.tabelog.com/tokyo/A1307/A130701/13206799/` と名称・地域を送信し、同じ正しい店名・住所と4出典の候補に到達。
- Instagram amourbymeeはURLだけではlogin_requiredの追加確認へ。巣鴨・Amour by meeで一致する公開情報が十分に得られない場合も別店舗を表示せず保留。これは外部公開情報の不足を正直に扱う挙動であり、常に診断成功を保証しない。
- PCおよび390px/320pxで追加確認・訂正入力の表示を確認（横スクロールなし）。メール・正式申込は送信していない。取得失敗後の進行中表示を非表示とし、検索候補の記号も確認済みチェックから区別した。
- 初回実AI検証で構造化JSONのannotation欠落による保留を検出し、公式 `web_search_call.action.sources` とモデル選択URLの積集合に修正。未検証のJSON出典をそのまま認める変更ではない。

## 根拠

- 本番対象URLの診断記録（連絡先・トークンは取得しない）。Chrome本番で403と別店舗表示を再現。
- OpenAI公式Web search output/citations: https://developers.openai.com/api/docs/guides/tools-web-search#output-and-citations
- OpenAI公式sources（構造化JSONではinline citationが省略されるため併用）: https://developers.openai.com/api/docs/guides/tools-web-search#sources
