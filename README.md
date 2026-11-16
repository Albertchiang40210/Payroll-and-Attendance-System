# 🏪 點心專賣店 員工出勤與薪資自動化結算系統

餐飲零售業的員工打卡、排班、請假與薪資結算後端系統（含簡易前端），薪資依打卡工時 × 時薪自動計算。

![CI](https://github.com/Albertchiang40210/Payroll-and-Attendance-System/actions/workflows/main.yml/badge.svg)

## ✨ 功能

- **JWT 登入 + 角色權限（RBAC）**：`ADMIN`（老闆）以帳密登入後台；`EMPLOYEE`（員工）不需帳密。
- **員工選名字打卡**：老闆在後台產生「打卡 QR Code」，員工用手機掃描一次即完成裝置登記（取得僅能打卡的裝置 token），之後只要選自己的名字即可打卡，並可查看自己最近 14 天的打卡紀錄（不含薪資）。QR Code 重新產生後，舊 QR Code 與所有已登記手機立即失效。離職員工可「停用」（從名單移除但保留歷史紀錄）。
- **加班打卡**：需先完成當天「正常」班的上、下班打卡才能使用，後端強制檢查。
- **打卡**：上/下班打卡，支援「正常」「加班」兩種班別；同日同班別不可重複打上班卡、未打上班卡不可打下班卡。時間一律以 `Asia/Taipei` 計算。
- **薪資結算**（ADMIN）：依月份彙整每位員工工時與薪資。一律按「工時 × 時薪」計算，加班與正常班相同，不另加成。
- **請假**：員工送出申請，老闆審核為 `APPROVED` / `REJECTED`。
- **排班**：老闆建立班表，所有登入者可檢視。
- **AI 臉部辨識打卡（Mock）**：`POST /api/clock/ai-recognize` 目前僅為示意 stub，會隨機回傳一位員工，**並未實作真實辨識**。
- **API 文件**：Swagger UI（`/api-docs`）。

## 🛠️ 技術棧

| 類別 | 使用 |
| :--- | :--- |
| 後端 | Node.js 20、Express 5（routes / controllers / middlewares 分層） |
| 資料庫 | MySQL 8 + Prisma ORM 5 |
| 安全 | JWT、bcrypt、helmet、cors、登入限流（15 分鐘 5 次） |
| 驗證 | Zod（請求 body / params） |
| 日誌 | Winston（含每日輪替檔案） |
| 測試 / CI | Jest + Supertest、GitHub Actions（含 MySQL service） |
| 部署 | Docker / docker-compose |
| 前端 | 原生 HTML/CSS/JS，淺色簡潔、手機優先（`public/`：打卡頁與老闆首頁 `index.html`、員工管理與 QR Code `employees.html`、薪資核算 `boss.html`） |

## 🚀 快速啟動

先複製環境變數並修改密碼與 `JWT_SECRET`：

```bash
cp .env.example .env
```

### 方式一：Docker 一鍵啟動

```bash
docker-compose up -d --build
```

容器啟動時會自動建立資料表。初次使用請建立管理員帳號：

```bash
docker-compose exec -e ADMIN_PASSWORD='你的密碼' punch_backend node prisma/seed.js
```

服務位於 `http://localhost:${APP_PORT_EXTERNAL}`（預設 3001）。

### 方式二：本機開發

```bash
docker-compose up -d punch_db   # 只啟動資料庫（對外 port 為 DB_PORT_EXTERNAL，預設 3311）
npm install
npx prisma db push              # 建立資料表並產生 Prisma Client
ADMIN_PASSWORD='你的密碼' npm run seed   # 建立管理員 admin
npm start                       # http://localhost:3001
```

> `.env` 中 `DATABASE_URL` 的 port 需與 `DB_PORT_EXTERNAL` 相同。管理員密碼由 `ADMIN_PASSWORD` 環境變數提供（至少 8 碼），專案不含預設密碼。正式環境（`NODE_ENV=production`）預設不開放 `/api-docs`，需要時在 `.env` 設定 `ENABLE_API_DOCS=true`。

## 🧪 測試

測試會**清空所連線資料庫的 `Attendance` 與 `User` 資料表**，請務必指向獨立的測試資料庫（例如 `punch_test`），切勿使用正式資料。

```bash
DATABASE_URL="mysql://root:<密碼>@localhost:3311/punch_test" JWT_SECRET=test npx prisma db push
DATABASE_URL="mysql://root:<密碼>@localhost:3311/punch_test" JWT_SECRET=test npm test
```

目前涵蓋打卡流程（未授權、上班、重複打卡、下班）、加班前置規則，以及店內裝置打卡（QR Code 登記、權限隔離、停用員工、QR 重新產生後舊手機失效）。測試已設定為依序執行（`--runInBand`）。

## 📡 API

互動式文件：`http://localhost:3001/api-docs`，點右上角 **Authorize** 貼上登入取得的 JWT 即可測試。

| 分類 | 方法 | 路由 | 說明 | 權限 |
| :--- | :--- | :--- | :--- | :--- |
| 驗證 | POST | `/api/auth/login` | 登入取得 Token | 公開 |
| 打卡 | POST | `/api/clock` | 上/下班打卡（`type: in/out`、`punch_type: 正常/加班`） | 登入者 |
| 打卡 | POST | `/api/clock/ai-recognize` | AI 辨識（Mock） | 登入者 |
| 打卡 | GET | `/api/attendance/today` | 今日出勤紀錄 | ADMIN |
| 薪資 | GET | `/api/salary?month=YYYY-MM` | 月薪資結算 | ADMIN |
| 員工 | GET / POST | `/api/employees` | 列表 / 新增 | ADMIN |
| 員工 | PUT / DELETE | `/api/employees/:id` | 修改（姓名、時薪、`active` 停用）/ 刪除 | ADMIN |
| 店內打卡 | POST | `/api/kiosk/pair` | 以 QR Code 通行碼換取裝置 token | 公開（限流） |
| 店內打卡 | GET | `/api/kiosk/employees`、`/api/kiosk/records` | 在職員工名單 / 某員工最近紀錄 | 裝置 token |
| 店內打卡 | POST | `/api/kiosk/clock` | 選名字打卡 | 裝置 token |
| 店內打卡 | GET / POST | `/api/kiosk/qr`、`/api/kiosk/qr/regenerate` | 檢視 / 重新產生打卡 QR Code | ADMIN |
| 請假 | POST | `/api/leaves` | 送出申請 | 登入者 |
| 請假 | GET | `/api/leaves` | 所有請假單 | ADMIN |
| 請假 | PUT | `/api/leaves/:id/status` | 審核（`APPROVED` / `REJECTED`） | ADMIN |
| 排班 | GET | `/api/shifts` | 檢視班表 | 登入者 |
| 排班 | POST | `/api/shifts` | 新增排班 | ADMIN |

## 📁 專案結構

```
src/
  app.js / server.js     Express 組裝與啟動
  routes/                路由定義
  controllers/           業務邏輯（打卡、薪資、請假…）
  middlewares/           JWT 驗證、角色限制、Zod 驗證、錯誤處理
  validations/           Zod schema
  config/swagger.js      OpenAPI 文件
  utils/                 logger、catchAsync
prisma/                  schema.prisma、seed.js
public/                  前端頁面
tests/                   Jest + Supertest
```

## ⚠️ 已知限制 / 後續規劃

- 薪資為單純「工時 × 時薪」，不含加班加成、週工時上限、休息時間扣除、例假日/國定假日加成。
- 時薪使用浮點數、金額四捨五入至整數；若用於正式帳務建議改用 `Decimal`。
- 測試覆蓋範圍僅限打卡流程，薪資計算尚缺單元測試。
- JWT 存放於前端 `localStorage`，正式環境建議改用 httpOnly cookie。
- 「選名字打卡」無法防止持有 QR Code 的人冒名代打，保護來自 QR Code 只提供給到店員工；如需更嚴格可為每位員工加上 PIN 碼。
- 打卡以「當天日期」配對上下班，跨午夜的班次（如 23:00 上班、隔日 01:00 下班）無法正確下班打卡。
