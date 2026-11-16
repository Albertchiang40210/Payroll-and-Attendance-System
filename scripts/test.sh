#!/usr/bin/env bash
# 在「獨立的暫時資料庫」跑全部測試，絕不碰正式資料。
# 用法：scripts/test.sh
#  1. 在 MySQL 容器建立暫時資料庫 punch_test
#  2. 以測試用映像（含 jest）在同一個 Docker 網路執行測試
#  3. 不論成功失敗，最後都刪除暫時資料庫
set -uo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

NETWORK="$(docker inspect punch_mysql --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' | head -1)"
DB="punch_test"
cleanup() { docker exec punch_mysql sh -c "MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\" mysql -uroot -e 'DROP DATABASE IF EXISTS $DB'" 2>/dev/null; }
trap cleanup EXIT

docker exec punch_mysql sh -c "MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\" mysql -uroot -e 'CREATE DATABASE IF NOT EXISTS $DB'" || exit 1
docker build -q --target test -t punch-test-image . >/dev/null || exit 1

docker run --rm --network "$NETWORK" \
  -e NODE_ENV=test \
  -e JWT_SECRET=test-secret \
  -e TZ=Asia/Taipei \
  -e DATABASE_URL="mysql://root:${MYSQL_ROOT_PASS}@punch_db:3306/${DB}" \
  punch-test-image
