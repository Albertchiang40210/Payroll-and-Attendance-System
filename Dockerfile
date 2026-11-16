# 多階段建置：正式映像只包含執行所需的套件，並以一般使用者（非 root）執行
FROM node:20-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
# 先複製套件清單，利用 Docker 快取加速重複建置
COPY package*.json ./
ENV PRISMA_HIDE_UPDATE_MESSAGE=1 CHECKPOINT_DISABLE=1

# ---------- 測試用映像：含開發套件（jest、supertest）----------
FROM base AS test
RUN npm ci
COPY . .
RUN npx prisma generate
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx jest --runInBand"]

# ---------- 正式映像 ----------
FROM base AS prod
ENV NODE_ENV=production
RUN npm ci --omit=dev
COPY . .
RUN npx prisma generate \
    && mkdir -p /app/logs \
    && chown -R node:node /app/logs
USER node
EXPOSE 3001
# 容器啟動時先同步資料表結構，再啟動服務
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm start"]
