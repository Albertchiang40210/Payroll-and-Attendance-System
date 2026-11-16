#!/usr/bin/env bash
# 每 5 分鐘由系統排程執行：檢查整套打卡系統是否正常，並向 Healthchecks.io 報平安。
#  - 正常 → 回報成功
#  - 有問題 → 立刻回報失敗並附上原因（Healthchecks 會寄 Email 給你）
#  - 連「報平安」都失敗（筆電當機、停電、斷網）→ Healthchecks 等不到訊息，過了寬限時間也會通知你
# Ping 網址放在 ~/.healthcheck_url（不放進專案、不進 git）。
set -u

HC_FILE="${HC_FILE:-$HOME/.healthcheck_url}"
PUBLIC_URL="${PUBLIC_URL:-https://ubuntuserver.tail2e54bc.ts.net}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
STATE_FILE="${STATE_FILE:-$HOME/.healthcheck_state}"
MAX_BACKUP_AGE_MIN="${MAX_BACKUP_AGE_MIN:-1800}"   # 30 小時
DISK_LIMIT_PCT="${DISK_LIMIT_PCT:-90}"
export PATH=/usr/local/bin:/usr/bin:/bin

[ -r "$HC_FILE" ] || { echo "找不到 $HC_FILE" >&2; exit 2; }
HC_URL="$(head -1 "$HC_FILE" | tr -d '[:space:]')"
[ -n "$HC_URL" ] || { echo "$HC_FILE 是空的" >&2; exit 2; }

# 同一時間只跑一個
exec 9>"/tmp/healthcheck.lock"; flock -n 9 || exit 0

problems=()

# 1. 從外面（公開網址）連回來：涵蓋網路、Tailscale Funnel、打卡系統、資料庫
body="$(curl -fsS --max-time 15 "$PUBLIC_URL/api/health" 2>&1)" \
  && [[ "$body" == *'"ok":true'* ]] \
  || problems+=("公開網址的健康檢查失敗（網路、Tailscale 或系統）: ${body:0:120}")

# 2. 容器有沒有在跑
for c in punch_web_service punch_mysql; do
  [ "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)" = "true" ] || problems+=("容器 $c 沒有在執行")
done

# 3. 硬碟空間
pct="$(df --output=pcent / | tail -1 | tr -dc 0-9)"
[ "${pct:-0}" -lt "$DISK_LIMIT_PCT" ] || problems+=("硬碟使用率 ${pct}% 過高")

# 4. 備份是否正常（每天 18:00 一份，超過 30 小時沒有新的就警告）
find "$BACKUP_DIR" -maxdepth 1 -name 'punch_db_*.sql.gz' -mmin "-$MAX_BACKUP_AGE_MIN" 2>/dev/null | grep -q . \
  || problems+=("超過 30 小時沒有新的資料庫備份")

stamp="$(date '+%F %T')"
if [ ${#problems[@]} -eq 0 ]; then
  curl -fsS --max-time 15 --retry 2 -o /dev/null "$HC_URL" && result="OK" || result="PING_FAILED"
  msg="正常"
else
  msg="$(printf '%s\n' "${problems[@]}")"
  curl -fsS --max-time 15 --retry 2 -o /dev/null --data-raw "$msg" "$HC_URL/fail" && result="FAIL_REPORTED" || result="FAIL_AND_PING_FAILED"
fi

# 只在狀態改變時寫紀錄，避免每 5 分鐘一行
prev="$(cat "$STATE_FILE" 2>/dev/null || echo none)"
if [ "$prev" != "$result" ]; then
  echo "[$stamp] 狀態: $prev → $result  $msg"
  echo "$result" > "$STATE_FILE"
fi
[ "$result" = "OK" ]
