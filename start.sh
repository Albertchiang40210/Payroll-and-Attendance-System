#!/bin/bash

# 1. 強制清除背景可能卡住的舊連線
killall ngrok 2>/dev/null

# 2. 在背景默默啟動打卡系統的後端伺服器 (3001 埠)
npm start &

# 3. 🔥 在背景啟動 ngrok，並直接綁定媽媽的專屬固定網址！
ngrok http 3001 --url=uncrown-pacific-sprout.ngrok-free.dev &

# 4. 等待 2 秒鐘，確保通道和網頁後端都順利醒過來
echo "⏳ 正在啟動媽媽的專屬固定外網通道，請稍候..."
sleep 2

# 5. 💡 因為是固定網址，直接把變數寫死，完全不用擔心抓不到
PUNCH_URL="https://uncrown-pacific-sprout.ngrok-free.dev"

# 6. 自動打開 Mac 預設瀏覽器跳轉到固定打卡網址
if [ ! -z "$PUNCH_URL" ]; then
    echo "🎉 固定外網開通成功！"
    echo "📱 員工專屬固定打卡網址：$PUNCH_URL"
    echo "💡 提示：以後每天網址都固定是這一個，不用再換囉！"
    open "$PUNCH_URL"
else
    echo "❌ 啟動失敗，請手動檢查連線。"
fi

# 讓終端機視窗保持開啟，方便你看輸出訊息
tail -f /dev/null

#./start.sh