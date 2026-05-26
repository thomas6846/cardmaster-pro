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

## 5. ScraperAPI (SNKRDUNK 代理) — **可選**

> 💡 我哋已經加咗「**員工手動 override 市價**」嘅 UI，所以 ScraperAPI 唔係必須。
> 你可以：
> - **方案 A**：唔填 `SCRAPERAPI_KEY`，全程用員工手動 input 市價（員工撳「SNKRDUNK」連結 → 喺 phone 睇真實價 → type 入系統）。$0/月。
> - **方案 B**：填 ScraperAPI key，AI 識卡後自動 fetch 市價，員工只需 confirm。fetch 唔到時 fallback 到手動。
>
> 建議先用方案 A 試一兩個禮拜睇真實使用情況，再決定要唔要俾 ScraperAPI $49/月。

如要方案 B：
1. 去 [scraperapi.com](https://www.scraperapi.com/) → **Start Free Trial**（5000 free credits 試用）
2. 試用滿意之後升 **Hobby $49/mo**：100k credits/月 + JS rendering + 國家選擇
3. Dashboard 攞 **API Key**
4. 注意：plan 要包含 **JS rendering** 同 **JP IP**

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
- [ ] ScraperAPI key（可選，留空都得）
- [ ] Shopify SHOP + TOKEN + LOCATION_ID
- [ ] Telegram BOT_TOKEN + CHAT_ID
- [ ] 自訂 domain（可選）：____________________________________

齊曬就話我知，我即刻幫你 push + 跟住 [DEPLOY.md](./DEPLOY.md) deploy。
