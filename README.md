# CardMaster Pro

AI 驅動的卡牌買取系統 — Next.js 15 / App Router / Prisma / SQLite / Anthropic Vision / Shopify / Telegram。

## 功能

| 模組 | 路徑 | 說明 |
|---|---|---|
| 店員介面 | `/scan` | 拍照 / 上傳 → Anthropic Vision 識別 → SNKRDUNK 行情 + Shopify 庫存 → 即時報價 |
| 主管審批 | `/approve/[token]` | Telegram Bot 推送連結，主管可調整 Condition / 價格後核准或拒絕 |
| 客戶結算 | `/transaction/[id]` | 勾選最終卡牌 / 客戶簽名 / 完成交易 |
| Shopify 同步 | 自動 | 完成交易後增加庫存 + 寫入 `cost_per_item` |
| 預算追蹤 | `/settings` | 每日預算上限，剩餘量自動影響報價（Budget Factor）|
| 買取協議書 PDF | `/api/transactions/[id]/pdf` | 含流水號、卡牌清單、客戶簽名、法律聲明 |
| 交易記錄 | `/history` | 歷史交易、PDF 重新下載 |

## 報價公式

```
FinalPrice = MarketPrice × BaseMargin × ConditionWeight × InventoryWeight × BudgetFactor
```

- **BaseMargin**：店家收購折扣（預設 0.65）
- **Condition**：S 1.0 / A 0.9 / B 0.8 / C 0.7 / D 0.5
- **Inventory**：庫存 ≥ 10 → 0.85；庫存 ≤ 2 → 1.10；其餘 1.0
- **Budget Factor**：當日預算剩餘比例衰減，從 1.0 線性降到 0.7

可在 `/settings` 即時調整所有係數。

## 快速開始

```bash
# 1. 安裝依賴（已執行）
npm install

# 2. 同步 SQLite schema（已執行）
DATABASE_URL="file:./cardmaster.db" npx prisma db push

# 3. 設定環境變數
cp .env.example .env.local
# 編輯 .env.local 填入 ANTHROPIC_API_KEY / SHOPIFY_* / TELEGRAM_*

# 4. 啟動 dev server
npm run dev
```

啟動後喺 browser 開 `http://localhost:3000`。

> ⚠️ zsh 提醒：默認 interactive zsh **唔會**把 `#` 當註解。
> 請淨係打 `npm run dev`，唔好喺同一行加 `# ...`，否則 `#` 會被當成 directory 傳俾 next dev。
> 如要支援，喺 `~/.zshrc` 加 `setopt INTERACTIVE_COMMENTS`。

## 環境變數

| 變數 | 用途 | 缺省行為 |
|---|---|---|
| `DATABASE_URL` | SQLite 路徑 | 必填 (`file:./cardmaster.db`) |
| `ANTHROPIC_API_KEY` | 卡牌識別 | 未設定時回傳 stub「未識別卡牌」 |
| `ANTHROPIC_MODEL` | 模型 ID | `claude-opus-4-7` |
| `SHOPIFY_SHOP` / `SHOPIFY_ADMIN_TOKEN` / `SHOPIFY_LOCATION_ID` | 庫存查詢與更新 | 未設定時庫存視為 0、同步跳過 |
| `SNKRDUNK_API_KEY` / `SNKRDUNK_API_BASE` | 市場價 | 未設定時走 deterministic mock |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | 審批推送 | 未設定時送審仍會建立交易，但需手動複製 URL |
| `NEXT_PUBLIC_APP_URL` | 審批連結絕對網址 | `http://localhost:3000` |
| `JPY_TO_HKD_RATE` | SNKRDUNK 日圓轉港幣 | `0.0505` |

## 架構

```
src/
├── app/
│   ├── api/
│   │   ├── recognize/             # 圖片 → 識別 + 報價 + 建卡
│   │   ├── cards/[id]/            # 改 Condition / 重算 / 刪除
│   │   ├── transactions/          # 建立交易、列表
│   │   ├── transactions/[id]/
│   │   │   ├── submit/            # 推送 Telegram
│   │   │   ├── settle/            # Shopify 同步 + 扣預算
│   │   │   └── pdf/               # 串流 PDF
│   │   ├── approve/[token]/       # 主管決策 API
│   │   └── settings/              # 預算與公式
│   ├── scan/                      # 店員介面
│   ├── transaction/[id]/          # 客戶結算 + 簽名
│   ├── approve/[token]/           # 主管審批頁
│   ├── history/                   # 交易列表
│   └── settings/                  # 設定頁
├── components/
│   ├── ui/                        # shadcn 元件 (button, card, dialog, ...)
│   ├── staff-scanner.tsx          # 店員主元件
│   ├── approval-view.tsx          # 主管審批 UI
│   ├── checkout-view.tsx          # 客戶結算 + 簽名板
│   └── settings-form.tsx
└── lib/
    ├── prisma.ts                  # PrismaClient singleton
    ├── pricing.ts                 # 報價引擎
    ├── anthropic.ts               # Vision API
    ├── snkrdunk.ts                # 市場價
    ├── shopify.ts                 # 庫存 + 同步
    ├── telegram.ts                # Bot 推送
    ├── pdf.ts                     # 買取協議書產生
    ├── settings.ts                # 設定與預算
    ├── audit.ts                   # 稽核日誌
    └── types.ts
```

## 資料模型

- **Card** — 每一次掃描即一行；含識別結果、市場價、庫存、報價、最終價、Shopify 連結
- **Transaction** — 一張買取單；單號 `BUY-YYYYMMDD-NNNN`、審批 token、客戶資料、簽名、PDF、Shopify 同步記錄
- **Settings** — 預算 + 報價公式參數
- **AuditLog** — 操作稽核（SCAN / SUBMIT / APPROVE / SETTLE …）

## 測試流程（無 API Key）

無 Anthropic / Shopify / Telegram 也可完整跑通：

1. `/scan` → 「拍照識別」上傳任意圖片 → 顯示 stub 卡牌 + mock 市場價 + 計算報價
2. 「送主管審批」→ 顯示審批 URL（Telegram 未設定時 toast 提示）
3. 打開審批 URL → 調整價格 → 核准
4. 回到 `/transaction/[id]` → 客戶簽名 → 完成交易（Shopify 跳過，預算照扣）
5. `/history` 看歷史 + 重新下載 PDF

## 已知 TODO

- 多角度圖片上傳（schema 已預留 `imageUrls`）
- Telegram Webhook 接收主管直接 inline approve（目前需點開頁面）
- SNKRDUNK 真實接入（目前是 deterministic mock）
- 多店面隔離（目前單店 settings 單例）
