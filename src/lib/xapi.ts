/**
 * X (Twitter) API v2 client — app-only bearer auth.
 *
 * Fetches a monitored shop account's recent tweets that contain images
 * (their 買取表 posts). Returns the image URLs + tweet metadata so the
 * ingestion pipeline can OCR each price-list image.
 *
 * Requires X_BEARER_TOKEN (X API v2, Basic tier $100/mo gives ~10k reads).
 */

const API = "https://api.twitter.com/2";
const TIMEOUT_MS = 12_000;

function bearer(): string | null {
  return process.env.X_BEARER_TOKEN || null;
}

async function xFetch<T>(path: string): Promise<T | null> {
  const token = bearer();
  if (!token) return null;
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[xapi] ${res.status} ${path}`, await res.text().catch(() => ""));
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn("[xapi] fetch failed", err);
    return null;
  }
}

export function isXConfigured(): boolean {
  return Boolean(bearer());
}

interface XUser {
  data?: { id: string; name: string; username: string };
}

export async function getUserId(handle: string): Promise<string | null> {
  const clean = handle.replace(/^@/, "");
  const u = await xFetch<XUser>(`/users/by/username/${encodeURIComponent(clean)}`);
  return u?.data?.id || null;
}

export interface MediaTweet {
  tweetId: string;
  text: string;
  createdAt?: string;
  imageUrls: string[];
  tweetUrl: string;
}

interface TweetsResponse {
  data?: Array<{
    id: string;
    text: string;
    created_at?: string;
    attachments?: { media_keys?: string[] };
  }>;
  includes?: {
    media?: Array<{ media_key: string; type: string; url?: string }>;
  };
  meta?: { newest_id?: string; result_count?: number };
}

/**
 * Recent media tweets newer than `sinceId`. Returns tweets that carry at
 * least one photo, with the photo URLs resolved. Capped at `max` tweets.
 */
export async function getRecentMediaTweets(
  userId: string,
  sinceId?: string | null,
  max = 10,
): Promise<{ tweets: MediaTweet[]; newestId: string | null }> {
  const params = new URLSearchParams({
    max_results: String(Math.min(Math.max(max, 5), 100)),
    "tweet.fields": "created_at,attachments",
    expansions: "attachments.media_keys",
    "media.fields": "url,type",
    exclude: "retweets,replies",
  });
  if (sinceId) params.set("since_id", sinceId);

  const resp = await xFetch<TweetsResponse>(
    `/users/${userId}/tweets?${params.toString()}`,
  );
  if (!resp?.data) return { tweets: [], newestId: null };

  const mediaByKey = new Map<string, string>();
  for (const m of resp.includes?.media || []) {
    if (m.type === "photo" && m.url) mediaByKey.set(m.media_key, m.url);
  }

  const tweets: MediaTweet[] = [];
  for (const t of resp.data) {
    const keys = t.attachments?.media_keys || [];
    const imageUrls = keys
      .map((k) => mediaByKey.get(k))
      .filter((u): u is string => Boolean(u));
    if (imageUrls.length === 0) continue;
    tweets.push({
      tweetId: t.id,
      text: t.text,
      createdAt: t.created_at,
      imageUrls,
      tweetUrl: `https://x.com/i/web/status/${t.id}`,
    });
  }

  return { tweets, newestId: resp.meta?.newest_id || null };
}

/**
 * Download an image URL and return it as a base64 data URL for Claude Vision.
 */
export async function imageUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
