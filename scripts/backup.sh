#!/usr/bin/env bash
# 每日備份 MySQL。用法：scripts/backup.sh（建議由 cron 每天執行）
# 備份存放在專案外的 ~/backups，保留最近 14 天。
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

set -a; . "$PROJECT_DIR/.env"; set +a

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
OUT="$BACKUP_DIR/punch_db_$(date +%Y%m%d_%H%M%S).sql.gz"

docker exec punch_mysql sh -c \
  "mysqldump -uroot -p\"\$MYSQL_ROOT_PASSWORD\" --single-transaction --routines \"$MYSQL_DB_NAME\"" \
  | gzip > "$OUT"

# 確認備份檔不是空的
[ "$(stat -c%s "$OUT")" -gt 200 ] || { echo "備份檔異常過小: $OUT" >&2; rm -f "$OUT"; exit 1; }

find "$BACKUP_DIR" -name 'punch_db_*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "備份完成: $OUT"

# 選配：上傳到雲端（需先以 rclone 設定好加密的遠端，名稱預設 gdrive-crypt）
# 未設定遠端時自動略過，不影響本機備份。
RCLONE="${RCLONE:-$HOME/.local/bin/rclone}"
REMOTE="${RCLONE_REMOTE:-gdrive-crypt}"
if [ -x "$RCLONE" ] && "$RCLONE" listremotes 2>/dev/null | grep -qx "$REMOTE:"; then
  "$RCLONE" copy "$OUT" "$REMOTE:punch_backups" \
    && "$RCLONE" delete "$REMOTE:punch_backups" --min-age "${KEEP_DAYS}d" \
    && echo "已上傳雲端: $REMOTE:punch_backups" \
    || echo "警告: 雲端上傳失敗（本機備份仍保留）" >&2
else
  echo "略過雲端上傳（尚未設定 $REMOTE）"
fi
