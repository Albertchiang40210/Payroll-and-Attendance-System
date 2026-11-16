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
