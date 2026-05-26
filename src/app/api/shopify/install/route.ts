import { NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const REQUIRED_SCOPES =
  "read_products,write_products,read_inventory,write_inventory,read_locations";

/**
 * Kicks off the Shopify OAuth install flow. Admin-only; generates a one-time
 * CSRF state, then redirects the user's browser to Shopify's authorize URL.
 * After they accept, Shopify redirects to /api/shopify/callback.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const shop = process.env.SHOPIFY_SHOP;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!shop || !clientId || !appUrl) {
    return NextResponse.json(
      {
        error:
          "Missing Shopify env vars. Need SHOPIFY_SHOP + SHOPIFY_CLIENT_ID + NEXT_PUBLIC_APP_URL.",
      },
      { status: 500 },
    );
  }

  const state = crypto.randomBytes(32).toString("hex");
  await prisma.shopifyOauthState.create({ data: { state, shop } });

  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/shopify/callback`;
  const authorizeUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&scope=${encodeURIComponent(REQUIRED_SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&grant_options[]=`;

  return NextResponse.redirect(authorizeUrl);
}
