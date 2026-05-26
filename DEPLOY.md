# Deploy to Railway

Railway = app + Postgres + env vars 一個 dashboard 搞掂。預計 15-25 分鐘（前提：[CREDENTIALS.md](./CREDENTIALS.md) 已搞掂 GitHub repo + Anthropic key 等）。

---

## A. 先 push 到 GitHub

```bash
cd "/Users/thomas/Desktop/MR 查價"

# 我已經 git init + commit 咗第一次。如果重新克隆過就要先：
# git init -b main
# git add -A
# git commit -m "Initial release"

git remote add origin git@github.com:你的username/cardmaster-pro.git
git push -u origin main
```

> 如果 push 卡住話 SSH key，先 `cat ~/.ssh/id_ed25519.pub`（冇就 `ssh-keygen -t ed25519`），複製到 GitHub Settings → SSH and GPG keys。

---

## B. Railway 開 Project（兩個 service：app + Postgres）

1. 入 [railway.app/new](https://railway.app/new) → **Deploy from GitHub repo**
2. 揀 `cardmaster-pro` → Railway 會 detect 到係 Next.js，**唔好** 即刻 deploy
3. 喺新 Project 入面：
   - **+ Create** → **Database** → **Add PostgreSQL**
4. 等 5 秒，會見到兩個 service：
   - `cardmaster-pro` (Next.js app)
   - `Postgres`

---

## C. 入 Env Variables（app service 入面）

撳 `cardmaster-pro` service → **Variables** tab → **+ New Variable** 逐個加：

| Key | Value |
|---|---|
| `DATABASE_URL` | 撳 `Add Reference` → 揀 `Postgres.DATABASE_URL` (Railway 自動連) |
| `DATABASE_DIRECT_URL` | 同 `DATABASE_URL` 一樣（reference） |
| `AUTH_SECRET` | 行 `openssl rand -base64 32` 嘅輸出 |
| `AUTH_URL` | Railway 自動分配嘅 URL（部署後返來填，例 `https://cardmaster-pro-production.up.railway.app`） |
| `NEXT_PUBLIC_APP_URL` | 同 `AUTH_URL` |
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `ANTHROPIC_MODEL` | `claude-opus-4-7` |
| `SHOPIFY_SHOP` | `your-store.myshopify.com` |
| `SHOPIFY_ADMIN_TOKEN` | `shpat_...` |
| `SHOPIFY_LOCATION_ID` | location ID 數字 |
| `SHOPIFY_API_VERSION` | `2025-01` |
| `TELEGRAM_BOT_TOKEN` | bot token |
| `TELEGRAM_CHAT_ID` | chat id（負數）|
| `JPY_TO_HKD_RATE` | `0.0505` |
| `NODE_ENV` | `production` |
| *(scraper env)* | 如你嘅 `src/lib/scraper.ts` 用到 cookie / proxy URL，喺度加 |

---

## D. Build & Start Commands

Railway 預設可能用 `npm run start` 但我哋要先 push schema + generate Prisma client。喺 `cardmaster-pro` service：

1. **Settings** tab
2. **Build Command**：
   ```
   npm install && npx prisma generate && npm run build
   ```
3. **Start Command**：
   ```
   npx prisma db push --accept-data-loss && npm run start
   ```
4. **Health Check Path**：`/`（可選）
5. **Public Networking** → **Generate Domain**（Railway 即時分配一條 `*.up.railway.app`）
6. 把嗰條 domain 複製，**返去 Variables** 填入 `AUTH_URL` 同 `NEXT_PUBLIC_APP_URL`，再撳 **Deploy**

> `prisma db push --accept-data-loss` 喺第一次 deploy 會建 schema；之後改 schema 時亦同樣會 sync。如果生產數據要謹慎，就改用 `prisma migrate deploy` 配合 migration files。

---

## E. 第一次啟動 — 建管理員

1. 開 `https://你的-railway-url.up.railway.app/setup`
2. 入姓名 / Email / 密碼（**214209**）→ **建立並登入**
3. 自動跳返首頁
4. 入 **使用者管理** 加店員（STAFF）+ 主管（SUPERVISOR）帳號

---

## F. 自訂 Domain（可選）

1. Railway service → **Settings** → **Networking** → **Custom Domain**
2. 加你嘅 domain（例：`cardmaster.yourshop.com`）
3. Railway 會顯示要喺 DNS 新增 CNAME → 去你 DNS provider（Cloudflare / GoDaddy）設定
4. 等 SSL auto issue（5-10 分鐘）
5. **重要**：更新 Variables 嘅 `AUTH_URL` + `NEXT_PUBLIC_APP_URL` 為新 domain，service redeploy

---

## 上線後 smoke checklist

- [ ] `/login` 可以登入（admin@you.com / 214209）
- [ ] `/setup` 已 redirect 到 `/login`
- [ ] STAFF 登入後唔見到「系統設定」/「使用者管理」
- [ ] SUPERVISOR / ADMIN 可開到 `/approve/[token]`，STAFF 開唔到
- [ ] `/scan` 真實上傳一張卡 → Claude Vision 識別成功
- [ ] 市價自動 fetch 自 ScraperAPI（或者員工手動入）
- [ ] 送審 → Telegram group 收到 message + 主管可登入審批
- [ ] 主管核准 → 客戶頁可下載 PDF 買取協議書
- [ ] 完成交易 → Shopify 庫存有增加 + 預算扣減

---

## 監控

- **Railway → Deployments**：每次 build / runtime log
- **Railway → Metrics**：CPU / RAM / Network
- **Postgres service → Connect**：直接連 DB 查資料
- **Railway → Logs**：scraper warning / 失敗會 `[snkrdunk] custom scraper threw ...`

---

## 注意

- ⚠️ **第一次 deploy 之前**，再 confirm `.env.local` 唔好揦住真 secret（已被 gitignore，但保險）
- ⚠️ 改 `prisma/schema.prisma` 之後 → push 上 GitHub → Railway auto redeploy → start command 會跑 `prisma db push`
- ⚠️ 密碼 `214209` 係 6 位 PIN，比建議 8 位短。風險係容易被暴力破解 — 上線後盡早 ADMIN → 改長密碼
- ⚠️ `src/lib/scraper.ts` 預設 return `null`，即 launch 時系統會行「mock + 員工手動 override」。寫好你嘅 scraper 之後 push 上 GitHub，Railway auto redeploy 就會即時生效
