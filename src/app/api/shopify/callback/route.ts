import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Receives Shopify's OAuth redirect after the merchant accepts scopes.
 * Verifies state + HMAC, exchanges the code for an offline access token
 * (shpat_*), and stores it in Settings so the rest of the app can use it
 * without env vars.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = url.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const shop = params.get("shop");
  const hmac = params.get("hmac");

  if (!code || !state || !shop || !hmac) {
    return new Response("Missing required OAuth params", { status: 400 });
  }

  // 1. State must exist + match (CSRF protection, prevents replay).
  const row = await prisma.shopifyOauthState.findUnique({ where: { state } });
  if (!row || row.shop !== shop) {
    return new Response("Invalid or expired state", { status: 400 });
  }
  await prisma.shopifyOauthState.delete({ where: { state } });

  // 2. HMAC verification — concatenate all params except hmac, sorted.
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientSecret) {
    return new Response("Server misconfigured: SHOPIFY_CLIENT_SECRET", {
      status: 500,
    });
  }
  const sortedQuery = [...params.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const computedHmac = crypto
    .createHmac("sha256", clientSecret)
    .update(sortedQuery)
    .digest("hex");
  if (
    !crypto.timingSafeEqual(
      Buffer.from(computedHmac, "utf8"),
      Buffer.from(hmac, "utf8"),
    )
  ) {
    return new Response("HMAC verification failed", { status: 400 });
  }

  // 3. Exchange code for access token.
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  if (!clientId) {
    return new Response("Server misconfigured: SHOPIFY_CLIENT_ID", {
      status: 500,
    });
  }
  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "");
    return new Response(
      `Token exchange failed (${tokenRes.status}): ${body.slice(0, 200)}`,
      { status: 502 },
    );
  }
  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    scope: string;
  };

  // 4. Persist to Settings (overwriting any prior install).
  await prisma.settings.update({
    where: { key: "config" },
    data: {
      shopifyShop: shop,
      shopifyAccessToken: tokenData.access_token,
      shopifyScopes: tokenData.scope,
      shopifyInstalledAt: new Date(),
    },
  });

  await logAudit({
    action: "SHOPIFY_INSTALL",
    entityType: "Settings",
    entityId: "config",
    actor: "shopify-oauth",
    payload: { shop, scopes: tokenData.scope },
  });

  // 5. Redirect admin back to /settings with success flag.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "/";
  return NextResponse.redirect(
    `${appUrl.replace(/\/$/, "")}/settings?shopify=installed`,
  );
}
