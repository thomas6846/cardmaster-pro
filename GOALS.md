# CardMaster Pro — Vision & Roadmap

> 文檔目的：清楚記低系統嘅願景、現狀、同分階段嘅升級計劃。
> 由 Thomas (Moonroad HK) 同 Claude Opus 4.7 共同維護。

---

## 🎯 願景

CardMaster Pro 係 **MOONROAD CARD STORE** 9 間實體分店嘅 AI 買取系統。目標：

1. **店員 30 秒識卡 + 報價**（vs 傳統人手 SNKRDUNK 查價 3-5 分鐘）
2. **主管遙距即時審批**（Telegram bot push，唔需要喺場）
3. **零誤差 Shopify 入庫**（自動建 product / 更新 stock + cost）
4. **法律合規嘅買取流程**（PDF 協議書、客戶簽名、流水號）
5. **多店面、多角色嘅 RBAC**（STAFF / SUPERVISOR / ADMIN）

---

## ✅ 現狀 (v0.2.0 - 2026-05-27)

### 已上線
- ✅ Next.js 15 App Router + Postgres on Railway
- ✅ Auth.js v5 三角色 + 第一個 admin 戶口
- ✅ Anthropic Claude Vision 卡牌識別 (~85-92% accuracy)
- ✅ 單卡 + 平鋪多卡掃描模式
- ✅ 動態報價公式：`Market × BaseMargin × Cond × Inv × Budget`
- ✅ 9 間分店 location picker
- ✅ Telegram bot 審批通知（chat `-4627568308`）
- ✅ Shopify OAuth + 自動建 product + 庫存 +1 + 寫 cost
- ✅ PDF 買取協議書（含簽名、流水號、法律條款）
- ✅ 員工市價手動 override

### 已知限制
- ⚠️ Claude 偶爾 hallucinate setCode（識成相似但唔啱嘅 set）
- ⚠️ Condition 只係單一字母 (S/A/B/C/D)，員工冇結構化理由
- ⚠️ SNKRDUNK 市場價暫時 mock（你自己寫嘅 scraper 仲未 plug）
- ⚠️ 重複買同款卡會建多個 Shopify draft（要員工合併）

---

## 🚀 升級 Roadmap

### Phase 1A — 結構化 Condition 評估 ⏳ 進行中

**問題**：而家 Claude 只返 "C"，員工冇辦法 challenge AI 嘅判斷。
**方案**：升級 prompt 要求 PSA-style breakdown（centering / corners / edges / surface），員工見到細項可以糾正。

**Schema 改動**：
- `Card.conditionDetails` (Json) — `{centering, corners, edges, surface, estimatedPsa}`
- `Card.aiConditionEstimate` (String) — Claude 原本估嘅 S/A/B/C/D
- `Card.conditionConfirmedByStaff` (Boolean) — 員工有冇改過

**為將來鋪路**：呢啲結構化 data 將來係訓練 condition CNN 嘅黃金 training set。

---

### Phase 1B — 公開 Card Database 驗證 ⏳ 進行中

**問題**：Claude 有時 hallucinate（e.g. 寫成 SV1a-007 但實際係 SV1a-001）。
**方案**：Claude 識別之後，hit 免費公開 API 驗證 (name, setCode) 真係存在：

| Source | TCG | API |
|---|---|---|
| **[Pokémon TCG API](https://pokemontcg.io/)** | Pokémon (JP + EN) | Free, no key needed |
| **[Scryfall](https://scryfall.com/docs/api)** | Magic: The Gathering | Free, no key |
| **[YGOPRODeck](https://ygoprodeck.com/api-guide/)** | Yu-Gi-Oh! | Free, no key |
| One Piece TCG / Weiss Schwarz | (未有 official API) | fallback to Claude |

**流程**：
```
Claude → (name, setCode) → 公開 API ?
                              ├ 找到 → 用 API 嘅 ground truth + 高清圖
                              └ 找唔到 → 員工確認 / fallback Claude
```

**Bonus**：API 返嘅 image URL 可以喺 scanner UI 顯示，員工一眼睇到「對唔對到」。

---

### Phase 2 — Image Embedding + Vector Search ⏸️ 排期中

**問題**：依賴 Claude API 每次 HK$0.04 ✕ 200 卡/日 = HK$240/月，仲有 1-3 秒 latency。
**方案**：用 CLIP / SigLIP 將每張卡圖 embed 做 512-dim vector，存 pgvector。Scan 時近似搜尋過去確認過嘅卡（同 Phase 1B 公開 DB 嘅圖）。

```
Photo → CLIP (50ms, local) → cosine similarity → top 5 候選 → 員工揀
```

**收益**：
- ✅ Cost: HK$0/張（CLIP 模型免費 self-host 或 HuggingFace Inference $0.0001）
- ✅ Accuracy 升 95-98%
- ✅ 完全冇 hallucination（候選一定真實）
- ✅ Data flywheel — 員工每次 confirm 都係新 reference point

**Setup 工作量**：4-6 小時，包：
1. Railway Postgres 加 `pgvector` extension
2. Prisma schema 加 `CardEmbedding` model
3. Ingestion script：fetch Pokémon TCG API → embed 30k 卡 → bulk insert pgvector
4. `/api/embed` route：接相 → 返 embedding
5. Scanner UI：scan → embed → vector search → 顯示 top 5 候選
6. 員工 confirm → 加入 embeddings table

**何時做**：Phase 1B 完之後，或者每日 scan > 100 張時。

---

### Phase 3 — Condition Classifier (TM 派上用場) ⏸️ 長遠

**前提**：已累積 5,000+ (卡相, 員工 final condition) 樣本。
**方案**：用 Teachable Machine / Roboflow / 自己 train MobileNet 訓練 5-class condition classifier。

**注意**：condition 主觀性高（人類 inter-rater agreement ~70%），model 永遠唔會比 prompt + 員工 review 嘅 hybrid 準好多。**ROI 中等**。

---

## 🔮 Phase 4+ — 未來可能性

- **SNKRDUNK 真實市價**：你自己寫嘅 scraper plug 入 [`src/lib/scraper.ts`](src/lib/scraper.ts)
- **Cardmarket / TCGPlayer 市價** fallback（歐美卡）
- **POS 收銀整合**：完成買取直接打印收據 / 印錢
- **客戶會員系統**：客人手機 app 睇歷史交易 + 賣咗幾多
- **庫存盤點 mode**：員工掃唔屬於買取嘅卡，做 stocktake
- **Mobile native app**（PWA / React Native）

---

## 🧭 設計原則

1. **AI 永遠係 suggestion，唔係 authority** — 員工 / 主管必須 confirm
2. **每個 AI 決定都要留低 audit trail** — 將來 train model + 法律 compliance
3. **公開資料優於專有資料** — 用免費 API + open model，避免 vendor lock-in
4. **Cost 透明** — 每張 scan 嘅成本可以追蹤
5. **Graceful degrade** — Anthropic 倒、Shopify 倒、SNKRDUNK 倒，員工都仲可以手動買取

---

## 📊 KPI 監察

- 每日 scan 數 + 完成交易數
- 每張 scan AI cost (HK$)
- Claude → 員工 override 嘅 condition 比例（target: <30%）
- Shopify 同步成功率 (target: >95%)
- Telegram 審批 → 員工結算嘅平均時間（target: <15 分鐘）

---

## 🗓️ 維護節奏

- **每月**：rotate Anthropic + Shopify + Telegram secrets
- **每季**：re-fetch 公開 card DB（Pokémon TCG API 等）
- **每半年**：review Phase 2/3 ROI，決定要唔要推進
