# 🏪 點心專賣店員工出勤與薪資自動化結算系統 (Dimsum Shop HR & Payroll System)

本專案是一套專為餐飲零售（點心專賣店）設計的數位化人力資源管理系統。經過全面重構與升級，系統現已採用業界標準的 **MVC 架構**，並導入 **Prisma ORM**、**JWT 身分驗證**與 **Zod 嚴格資料驗證**，提供更安全、更易擴充的企業級解決方案。

---

## 🛠️ 核心系統功能 (Core Features)

### 1. 🔒 企業級權限控管 (Role-Based Access Control)
* **JWT 身分驗證**：所有 API 皆受 JWT 保護，徹底解決傳統系統「員工互相代打卡」的作弊漏洞。
* **角色分離**：系統分為 `ADMIN` (老闆) 與 `EMPLOYEE` (員工)。僅有老闆能新增員工、查閱薪資報表與審核請假。

### 2. 智慧型數位打卡與薪資引擎
* **防重複打卡防呆**：後端嚴格校驗，防範不合理的打卡行為。
* **勞基法加班費自動試算**：薪資結算時，自動判斷單日工時。前 8 小時為正常時薪，第 8~10 小時以 **1.34倍** 計算，超過 10 小時以 **1.67倍** 計算，符合台灣現行法規。

### 3. 排班與請假管理模組 (Shift & Leave Management)
* **請假系統**：支援員工送出請假單，並由老闆在後台進行審核 (`APPROVED` / `REJECTED`)。
* **排班系統**：提供老闆預先安排員工出勤班表的功能，便於店面人力調度。

---

## 💻 技術棧 (Tech Stack)

* **後端核心**：Node.js / Express (MVC 架構)
* **資料庫 ORM**：[Prisma](https://www.prisma.io/) (支援型別安全與自動化遷移)
* **關聯式資料庫**：MySQL 8.0
* **資安防護**：`jsonwebtoken` (JWT), `bcrypt` (密碼雜湊), `helmet`, `cors`
* **資料驗證**：`Zod`
* **時間處理**：`Day.js` (鎖定 `Asia/Taipei` 時區)
* **自動化測試**：`Jest`, `Supertest`

---

## 🚀 快速啟動 (Quick Start)

### 1. 啟動資料庫 (使用 Docker)
請確保您的機器已安裝 Docker，並執行以下指令啟動 MySQL：
```bash
docker-compose up -d punch_db
```

### 2. 安裝依賴與初始化
```bash
npm install
# 推送資料庫結構並產生 Prisma Client
npx prisma db push
# 建立預設的管理員帳號 (admin / admin123)
node prisma/seed.js
```

### 3. 啟動伺服器
```bash
npm start
```
伺服器將會運行在 `http://localhost:3001`。

---

## 📡 RESTful API 規格說明 (API Endpoints)

您可以透過瀏覽器訪問 `http://localhost:3001/api-docs` 查看完整的 Swagger 互動式 API 文件。介面右上角提供 **Authorize (鎖頭)** 功能，輸入 `Bearer <Your_JWT_Token>` 即可測試受保護的端點。

| 分類 | 方法 | 路由 | 功能說明 | 權限需求 |
| :--- | :--- | :--- | :--- | :--- |
| **驗證** | POST | `/api/auth/login` | 使用者登入取得 Token | 無 |
| **打卡** | POST | `/api/clock` | 上班/下班打卡 | 所有登入者 |
| **打卡** | GET | `/api/attendance/today` | 取得今日出勤流水帳 | ADMIN |
| **薪資** | GET | `/api/salary?month=...` | 月終薪資與加班費結算 | ADMIN |
| **員工** | POST | `/api/employees` | 新增員工資料 | ADMIN |
| **請假** | POST | `/api/leaves` | 送出請假申請 | 所有登入者 |
| **請假** | PUT | `/api/leaves/:id/status`| 審核請假狀態 | ADMIN |
| **排班** | POST | `/api/shifts` | 新增排班紀錄 | ADMIN |
