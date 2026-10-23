# 使用輕量版 Node 基礎鏡像
FROM node:20-slim

# 設定容器內的工作目錄
WORKDIR /app

# 先複製 package.json 和 package-lock.json (利用 Docker 快取機制優化編譯速度)
COPY package*.json ./

# 在編譯階段就直接把所有套件安裝好！
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN npm ci

# 複製其餘的所有原始碼檔案
COPY . .

# 產生 Prisma Client
RUN npx prisma generate

# 宣告容器內部監聽 3001 埠號
EXPOSE 3001

# 容器啟動時的指令
# 啟動前先同步資料表結構
CMD ["sh", "-c", "npx prisma db push && npm start"]