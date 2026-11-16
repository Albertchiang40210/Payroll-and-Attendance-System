# 🏪 車庫小籠包 員工出勤與薪資自動化結算系統

餐飲零售業的員工打卡、排班、請假與薪資結算後端系統（含簡易前端），薪資依打卡工時 × 時薪自動計算。

![CI](https://github.com/Albertchiang40210/Payroll-and-Attendance-System/actions/workflows/main.yml/badge.svg)

## ✨ 功能

- **JWT 登入 + 角色權限（RBAC）**：`ADMIN`（老闆）以帳密登入後台；`EMPLOYEE`（員工）不需帳密。
- **員工手機綁定 + 專屬 QR Code**：員工不需帳密。老闆在後台**選一位員工**產生專屬登記 QR Code（預設 10 分鐘有效、只能用一次，被拍照也無法再使用，也可用 LINE 傳連結給本人），員工掃描後這支手機就**只屬於這位員工**，只能替他自己打卡，打開網頁直接是自己的打卡畫面（沒有名單可選，無法代打）。員工換手機時重新產生即可，舊手機自動失效；離職停用後手機也立即不能打卡。打卡畫面可查看自己最近 14 天的紀錄與本月統計（不含薪資）。
- **只能在店裡打卡（定位驗證）**：老闆人在店裡時按一次「把我現在的位置設為店的位置」，之後員工手機打卡時會回報位置，離店超過設定範圍（預設 150 公尺）或定位不準、未允許定位都無法打卡；每筆打卡會記錄離店距離供事後查核。未設定位置時不限制。
- **加班打卡**：需先完成當天「正常」班的上、下班打卡才能使用，後端強制檢查；下班打卡一律需先有同班別的上班打卡。
- **員工管理**：新增（員工只需姓名與時薪）、修改時薪、**離職**（從名單與打卡移除、保留歷史紀錄，可復職）、**刪除**（連同打卡紀錄永久刪除；有打卡紀錄的人須先標記離職才能永久刪除，不能刪除自己的帳號）。管理員可自行決定是否也要打卡。
- **休假**：整天沒有任何打卡紀錄的日子自動列為休假（只算到昨天、員工到職日之後、在職員工），顯示於員工紀錄、薪資核算與當日查詢。
- **補打卡**（ADMIN）：老闆可替員工補登、修改、刪除出勤紀錄（不可補未來時間、下班需晚於上班），補登紀錄會標記「補登」並可附備註。
- **出勤查詢**（ADMIN）：首頁可選任一日期，查看當天誰上班、誰尚未打卡（過去日期即為休假）。
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
| 前端 | 原生 HTML/CSS/JS，淺色簡潔、手機優先（`public/`：打卡頁與老闆首頁 `index.html`、員工管理 `employees.html`、員工手機與打卡位置 `qrcode.html`、補打卡 `attendance.html`、薪資核算 `boss.html`；店標放在 `public/img/logo.jpg`） |

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

目前涵蓋打卡流程（未授權、上班、重複打卡、下班）、加班前置規則，以及店內裝置打卡（專屬一次性登記碼（時效、同時搶名額）、手機只能替自己打卡、換手機、解除與停用、定位驗證（距離、精度、未開定位））。測試已設定為依序執行（`--runInBand`）。

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
| 出勤 | GET | `/api/attendance/day?date=YYYY-MM-DD` | 指定日期的出勤與未打卡名單 | ADMIN |
| 出勤 | GET | `/api/attendance/my-records` | 登入者最近 14 天紀錄與本月統計 | 登入者 |
| 補打卡 | GET / POST | `/api/records` | 某員工某月紀錄（含休假日）/ 補登一筆 | ADMIN |
| 補打卡 | PUT / DELETE | `/api/records/:id` | 修改 / 刪除一筆紀錄 | ADMIN |
| 店內打卡 | POST | `/api/kiosk/pair` | 以專屬 QR Code 通行碼綁定手機並取得裝置 token | 公開（限流） |
| 店內打卡 | GET | `/api/kiosk/me`、`/api/kiosk/records` | 這支手機的主人 / 其最近紀錄 | 裝置 token |
| 店內打卡 | POST | `/api/kiosk/clock` | 替綁定的員工打卡（`type`、`punch_type`、`location`） | 裝置 token |
| 店內打卡 | GET / POST | `/api/kiosk/qr` | 目前有效的登記 QR Code / 為某員工產生（`userId`、`ttl_minutes`） | ADMIN |
| 店內打卡 | GET / DELETE | `/api/kiosk/devices`、`/api/kiosk/devices/:userId` | 各員工手機登記狀態 / 解除某員工的手機 | ADMIN |
| 店內打卡 | GET / PUT / DELETE | `/api/kiosk/location` | 店的位置與允許範圍（定位驗證） | ADMIN |
| 店內打卡 | POST | `/api/kiosk/revoke-all` | 讓所有員工手機失效 | ADMIN |
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
- 定位驗證依賴手機 GPS：室內可能有數十公尺誤差（故預設範圍 150 公尺），且無法防範刻意使用「虛擬定位」App 的人；每筆打卡記錄的離店距離可供事後查核。一支手機綁定一位員工，無法代他人打卡，但員工可能把手機借給他人使用。
- 打卡以「當天日期」配對上下班，跨午夜的班次（如 23:00 上班、隔日 01:00 下班）無法正確下班打卡。
