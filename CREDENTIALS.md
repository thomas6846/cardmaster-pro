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

## 2. Vercel (App hosting)

1. 去 [vercel.com](https://vercel.com) → **Sign up with GitHub**（用同一個 account 方便）
2. 第一次會自動裝 Vercel GitHub App，授權埋俾 `cardmaster-pro` repo
3. **暫時唔好按 Deploy** — 等我 push code 之後先做

> Free tier 已夠 launch。如果想要永遠 always-on（無冷啟動）+ 多 bandwidth，升 Pro $20/mo。

---

## 3. Neon Postgres (Database)

1. 去 [neon.tech](https://neon.tech) → **Sign up with GitHub**
2. 建立 Project：
   - Name: `cardmaster-pro`
   - Postgres version: 16 (latest)
   - **Region: AWS Asia Pacific 1 (Singapore)** ← 最接近 HK
3. 建立後喺 **Dashboard → Connection Details**：
   - 揀 `Connection string`，**Pooled connection** 嗰條
   - 樣樣似：`postgresql://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
   - **複製，等陣俾我入 Vercel env vars**

> Free tier：0.5GB 容量、191 compute-hours/月。對小店嚟講超過頭。

---

## 4. Anthropic API ✅ (你已有)

確認以下：
- Key 已 generate（`sk-ant-...`）
- Account 有 credit（最少 USD$10，建議 $20-30 起跳）
- Model `claude-opus-4-7` 可用

---

## 5. ScraperAPI (SNKRDUNK 代理)

1. 去 [scraperapi.com](https://www.scraperapi.com/) → **Start Free Trial**（5000 free credits）
2. 試用滿意之後升 **Hobby $49/mo**：100k credits/月 + JS rendering + 國家選擇
3. Dashboard 攞 **API Key**
4. 註意：plan 要包含 **JS rendering** 同 **JP IP**

> 5000 free credits 夠你試大約 100 次查價。Hobby plan 可以撐到中型店一個月運作。

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

將下面填好交俾我（**或者貼喺 `.env.production.local`**）：

```bash
# Database
DATABASE_URL="postgresql://...@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"

# Anthropic
ANTHROPIC_API_KEY="sk-ant-..."
ANTHROPIC_MODEL="claude-opus-4-7"

# Shopify
SHOPIFY_SHOP="your-store.myshopify.com"
SHOPIFY_ADMIN_TOKEN="shpat_..."
SHOPIFY_LOCATION_ID="12345678"
SHOPIFY_API_VERSION="2025-01"

# SNKRDUNK via ScraperAPI
SCRAPERAPI_KEY="your_scraperapi_key"
SCRAPERAPI_COUNTRY="jp"

# Telegram
TELEGRAM_BOT_TOKEN="123456789:ABC..."
TELEGRAM_CHAT_ID="-1001234567890"

# App
NEXT_PUBLIC_APP_URL="https://your-vercel-domain.vercel.app"
AUTH_SECRET="run: openssl rand -base64 32"
AUTH_URL="https://your-vercel-domain.vercel.app"
JPY_TO_HKD_RATE="0.0505"
```

⚠️ **永遠唔好 commit `.env.production.local` 入 GitHub**。`.gitignore` 已經有。

---

## Checklist (打勾交俾我)

- [ ] GitHub repo URL：____________________________________
- [ ] Vercel account 開好
- [ ] Neon DATABASE_URL（pooled）：____________________________________
- [ ] Anthropic API key + credit ≥ $20
- [ ] ScraperAPI key
- [ ] Shopify SHOP + TOKEN + LOCATION_ID
- [ ] Telegram BOT_TOKEN + CHAT_ID
- [ ] 自訂 domain（可選）：____________________________________

齊曬就話我知，我即刻 push + deploy。
