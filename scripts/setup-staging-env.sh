#!/bin/sh
set -eu

PROJECT_REF="${AIO_STAGING_SUPABASE_REF:-zlqqjifitnvorudxbepy}"
APP_URL="${AIO_STAGING_APP_URL:-https://aio-growth-partner-staging.vercel.app}"
SUPABASE_BIN="${SUPABASE_BIN:-/opt/homebrew/bin/supabase}"
JQ_BIN="${JQ_BIN:-/usr/bin/jq}"
OUTPUT_FILE="${AIO_STAGING_ENV_FILE:-.env.local}"

if [ ! -x "$SUPABASE_BIN" ]; then
  echo "Supabase CLIが見つかりません: $SUPABASE_BIN" >&2
  exit 1
fi

if [ ! -x "$JQ_BIN" ]; then
  echo "jqが見つかりません: $JQ_BIN" >&2
  exit 1
fi

keys_file="$(mktemp)"
env_file="$(mktemp)"

cleanup() {
  rm -f "$keys_file" "$env_file"
}
trap cleanup EXIT HUP INT TERM

chmod 600 "$keys_file" "$env_file"

"$SUPABASE_BIN" projects api-keys \
  --project-ref "$PROJECT_REF" \
  --reveal \
  --output json \
  --agent no > "$keys_file"

publishable_key="$("$JQ_BIN" -r '.[] | select(.type == "publishable" and .name == "default") | .api_key' "$keys_file")"
secret_key="$("$JQ_BIN" -r '.[] | select(.type == "secret" and .name == "aio_staging_vercel") | .api_key' "$keys_file")"

case "$publishable_key" in
  sb_publishable_*) ;;
  *)
    echo "staging publishable keyを取得できませんでした。" >&2
    exit 1
    ;;
esac

case "$secret_key" in
  sb_secret_*) ;;
  *)
    echo "staging secret key（aio_staging_vercel）を取得できませんでした。" >&2
    exit 1
    ;;
esac

umask 077
{
  printf 'NEXT_PUBLIC_APP_URL=%s\n' "$APP_URL"
  printf 'APP_BASE_URL=%s\n' "$APP_URL"
  printf 'NEXT_PUBLIC_SUPABASE_URL=https://%s.supabase.co\n' "$PROJECT_REF"
  printf 'NEXT_PUBLIC_SUPABASE_ANON_KEY=%s\n' "$publishable_key"
  printf 'SUPABASE_SERVICE_ROLE_KEY=%s\n' "$secret_key"
} > "$env_file"

mv "$env_file" "$OUTPUT_FILE"
chmod 600 "$OUTPUT_FILE"

echo "AIO staging用の環境変数を $OUTPUT_FILE に設定しました。"
echo "設定項目: NEXT_PUBLIC_APP_URL, APP_BASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY"
