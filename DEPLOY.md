# Deploy to Vercel + Neon Postgres

跟住做就 launch 到 production。預計 15-30 分鐘（前提：[CREDENTIALS.md](./CREDENTIALS.md) 已經做完）。

---

## A. 先 push 到 GitHub

```bash
cd "/Users/thomas/Desktop/MR 查價"

git init -b main
git add -A
git commit -m "Initial CardMaster Pro release"

git remote add origin git@github.com:你的username/cardmaster-pro.git
git push -u origin main
```

> 如果 `git push` 要 SSH key，先去 GitHub Settings → SSH and GPG keys 加返自己 Mac 嘅 public key（`cat ~/.ssh/id_ed25519.pub`，冇就 `ssh-keygen -t ed25519`）。

---

## B. Neon Postgres 建好之後 — 推 schema

喺本地：

```bash
cd "/Users/thomas/Desktop/MR 查價"

# 你嘅 Neon connection string（pooled 嗰條），匯出
export DATABASE_URL="postgresql://...@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
export DATABASE_DIRECT_URL="$DATABASE_URL"   # 同一條就得

# 把所有 model 推上去（建 table、index、enum）
npx prisma db push

# 確認 generated client 對應住
npx prisma generate
```

---

## C. Vercel 部署

1. 去 [vercel.com/new](https://vercel.com/new)
2. **Import Git Repository** → 揀 `cardmaster-pro`
3. **Framework Preset**：Next.js（自動偵測到）
4. **Root Directory**：保持 `./`
5. **Environment Variables**：撳 `Add`，逐個 paste 入去（**唔好** import `.env`）：

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | Neon pooled URL |
   | `DATABASE_DIRECT_URL` | Neon pooled URL（同一條 OK） |
   | `AUTH_SECRET` | 行 `openssl rand -base64 32` 嘅輸出 |
   | `AUTH_URL` | `https://cardmaster-pro-xxx.vercel.app`（部署後再回來填）|
   | `NEXT_PUBLIC_APP_URL` | 同 AUTH_URL |
   | `ANTHROPIC_API_KEY` | `sk-ant-...` |
   | `ANTHROPIC_MODEL` | `claude-opus-4-7` |
   | `SHOPIFY_SHOP` | `your-store.myshopify.com` |
   | `SHOPIFY_ADMIN_TOKEN` | `shpat_...` |
   | `SHOPIFY_LOCATION_ID` | location ID 數字 |
   | `SHOPIFY_API_VERSION` | `2025-01` |
   | `SCRAPERAPI_KEY` | ScraperAPI key |
   | `SCRAPERAPI_COUNTRY` | `jp` |
   | `TELEGRAM_BOT_TOKEN` | bot token |
   | `TELEGRAM_CHAT_ID` | chat id（負數）|
   | `JPY_TO_HKD_RATE` | `0.0505` |

6. **Deploy** — 等 2-3 分鐘
7. 部署完攞到 URL（例如 `cardmaster-pro-xxx.vercel.app`），返去 Environment Variables 更新 `AUTH_URL` 同 `NEXT_PUBLIC_APP_URL`，再 redeploy 一次

---

## D. 第一次啟動 — 建管理員

1. 開 `https://你的網址/setup`
2. 入姓名 / Email / 密碼（≥8 位）→ **建立並登入**
3. 自動跳返首頁
4. 入 **使用者管理** 加店員（STAFF）+ 主管（SUPERVISOR）帳號

---

## E. 設 Telegram Webhook（可選）

如果想主管收到通知後 inline approve（唔開頁面都得），可以再加 webhook。目前係用 **inline button + URL link** 嘅做法，主管撳 link 開審批頁登入後決定。

---

## F. 自訂 Domain

1. Vercel project → Settings → Domains → Add
2. 入你嘅 domain，跟 DNS 指引（A 或 CNAME）
3. 等 SSL issue（5-10 分鐘）
4. 更新 `AUTH_URL` + `NEXT_PUBLIC_APP_URL` 為新 domain，redeploy

---

## 上線後 smoke checklist

- [ ] `/login` 可以登入
- [ ] `/setup` 已經 404（因為已有 user）
- [ ] STAFF 登入後唔見到「系統設定」/「使用者管理」
- [ ] SUPERVISOR 開到 `/approve/[token]` 但 STAFF 開唔到 POST
- [ ] `/scan` 真實上傳一張卡 → AI 識別成功（Anthropic）
- [ ] 報價反映到實際 SNKRDUNK 價（ScraperAPI 成功）
- [ ] 送審 → Telegram group 收到 message
- [ ] 主管登入後審批 → 客戶 PDF 出到、Shopify 庫存有增加

---

## 監控

- **Vercel Logs**：Vercel project → Logs（real-time）
- **Neon Dashboard**：query metrics + slow queries
- **ScraperAPI Dashboard**：credit 用量 + 成功率

---

## 注意事項

- ⚠️ **第一個 deploy 之前**，喺 `.env.local` 把所有 secrets 清空（avoid 不小心 commit）
- ⚠️ **永遠唔好 push `.env*.local`** — `.gitignore` 已經有
- ⚠️ **如果改 schema**，要先本地 `prisma db push` 對 Neon，再 Vercel redeploy
- ⚠️ **ScraperAPI credit 監控** — 你部 app 每張卡用一次 credit（cache 6 小時）。100k credit/月 = 每日 3000+ 次唔重複嘅卡 query
