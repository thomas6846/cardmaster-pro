const API_BASE = "https://api.telegram.org";

function isConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export async function sendApprovalRequest(opts: {
  transactionNo: string;
  approvalUrl: string;
  staffName?: string;
  totalAmount: number;
  cardCount: number;
}): Promise<SendResult> {
  if (!isConfigured()) {
    return { ok: false, error: "Telegram not configured" };
  }
  const text =
    `🆕 *新買取單待審批*\n` +
    `單號: \`${opts.transactionNo}\`\n` +
    `店員: ${opts.staffName || "—"}\n` +
    `卡牌數: ${opts.cardCount}\n` +
    `總金額: *HKD ${opts.totalAmount.toLocaleString()}*\n\n` +
    `[👉 點此審批](${opts.approvalUrl})`;

  try {
    const res = await fetch(
      `${API_BASE}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text,
          parse_mode: "Markdown",
          disable_web_page_preview: false,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ 打開審批頁",
                  url: opts.approvalUrl,
                },
              ],
            ],
          },
        }),
      },
    );

    const data = await res.json();
    if (!data.ok) {
      return { ok: false, error: data.description || "Telegram error" };
    }
    return { ok: true, messageId: String(data.result?.message_id) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function notifyDecision(opts: {
  transactionNo: string;
  decision: "approved" | "rejected";
  supervisorName?: string;
  totalAmount: number;
  note?: string;
}): Promise<SendResult> {
  if (!isConfigured()) return { ok: false, error: "Telegram not configured" };
  const emoji = opts.decision === "approved" ? "✅" : "❌";
  const text =
    `${emoji} *${opts.decision === "approved" ? "已核准" : "已拒絕"}* \`${opts.transactionNo}\`\n` +
    `主管: ${opts.supervisorName || "—"}\n` +
    `金額: HKD ${opts.totalAmount.toLocaleString()}\n` +
    (opts.note ? `備註: ${opts.note}` : "");

  try {
    const res = await fetch(
      `${API_BASE}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text,
          parse_mode: "Markdown",
        }),
      },
    );
    const data = await res.json();
    return { ok: !!data.ok, messageId: String(data.result?.message_id) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
