# CardMaster Pro — 上線 Credentials 一站式指南

跟住做就可以攞齊所有 token。預計 30-45 分鐘。

---

## 1. GitHub repo (推 code 用)

1. 登入 [github.com](https://github.com)
2. 右上 `+` → **New repository**
3. Owner: 你嘅 username；Name: `cardmaster-pro`；**設 Private**
4. 唔好勾任何 README/.gitignore（我已經有）
5. 建立後保留嗰條 URL，例如 `git@github.com:yourname/cardmaster-pro.git`

---

## 2. Railway (App + Postgres 一站式) ✅（你已有 account）

1. 去 [railway.app/new](https://railway.app/new) → **Deploy from GitHub repo**（之後做 deploy 嗰陣）
2. **暫時唔需做嘢** — 等 git push 完先做
3. Hobby Plan US$5/月（包 500 hrs runtime + 8GB Postgres）對小店超夠

> Railway 同時 host Next.js + Postgres + env vars + auto HTTPS + custom domain，一個 dashboard 搞掂。冇 Vercel cold start 問題。

---

## 4. Anthropic API ✅ (你已有)

確認以下：
- Key 已 generate（`sk-ant-...`）
- Account 有 credit（最少 USD$10，建議 $20-30 起跳）
- Model `claude-opus-4-7` 可用

---

## 5. SNKRDUNK Scraper — **你自己寫**

唔用第三方 service，由你寫嘅 scraper 喺 [`src/lib/scraper.ts`](./src/lib/scraper.ts) 入面。

- Default `fetchSnkrdunkPrice()` return `null`，即系統當「冇 scraper」處理：
  - Cache 有就用 cache
  - 冇就 fallback 去 deterministic mock
  - 員工任何時候都可以喺 UI 手動 override 市價
- 你 implement 完之後，return `{ jpy, sampleSize?, reference? }`，系統自動 cache 6 小時 + 計入報價公式
- 如果你嘅 scraper 需要 env var（cookie / proxy URL 等），喺 `src/lib/scraper.ts` 入面讀 `process.env.XXX`，Railway Variables 入面同步加

---

## 6. Shopify Admin API

⚠️ 前提：你已經有 Shopify shop。如果未開，先 [signup.shopify.com](https://www.shopify.com/hk-en/free-trial)。

1. Shopify admin → 左下 **Settings** → **Apps and sales channels**
2. **Develop apps**（如果未啟動，撳 `Allow custom app development`）
3. **Create an app**
   - App name: `CardMaster Pro`
   - App developer: 你自己
4. 入去 app → **Configuration** → **Admin API integration → Configure**
5. 揀以下 **Admin API access scopes**：
   - `read_products`, `write_products`
   - `read_inventory`, `write_inventory`
   - `read_locations`
6. **Save**
7. **API credentials** tab → **Install app** → 確認
8. 安裝完會見到 **Admin API access token**（`shpat_...`）— **得睇一次！立即複製**
9. **Shop URL**：admin URL 嘅前綴，例如 `your-store.myshopify.com`
10. **Location ID**：
    - admin → Settings → **Locations**
    - 揀返你主倉庫 → URL 尾巴會顯示 ID，例如 `/admin/settings/locations/12345678` → 取 `12345678`

---

## 7. Telegram Bot

1. 喺 Telegram 入面搵 **@BotFather** → `/newbot`
2. Bot name: `CardMaster Pro Approval`
3. Username: `cardmaster_approval_bot`（要全球唯一）
4. 攞返條 **token**（`123456789:ABC...`）
5. **建立一個 group**，加埋你嘅 bot 同所有主管入去
6. 喺 group 入面講 `@userinfobot` → 佢會回覆 group 嘅 `chat_id`（負數，例如 `-1001234567890`）
   - 或者搵 `@RawDataBot`，將佢加 group → 佢即時 dump chat info
7. **保留：token + chat_id**

---

## 8. 自訂 Domain（可選）

如果想要自己嘅 domain（例如 `cardmaster.yourshop.com`）：
1. 喺 Cloudflare / Godaddy 買 domain
2. Vercel project → Settings → Domains → Add → 跟住設 DNS
3. 等 SSL 自動 issue（5-10 分鐘）

---

## 全部攞齊之後

入 Railway service 嘅 Variables tab 一個個 paste，**唔好 commit `.env.production`**。詳細參考 [DEPLOY.md](./DEPLOY.md)。

---

## Checklist (打勾交俾我)

- [ ] GitHub repo URL：____________________________________
- [ ] Railway account ✅（你已有）
- [ ] Anthropic API key + credit ≥ $20 ✅（你已有）
- [ ] SNKRDUNK scraper（你自己 implement `src/lib/scraper.ts`，可後補）
- [ ] Shopify SHOP + TOKEN + LOCATION_ID
- [ ] Telegram BOT_TOKEN + CHAT_ID
- [ ] 自訂 domain（可選）：____________________________________

齊曬就話我知，我即刻幫你 push + 跟住 [DEPLOY.md](./DEPLOY.md) deploy。
