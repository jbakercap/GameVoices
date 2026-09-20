/**
 * Shared RSS/Atom parsing utilities used by ingest-rss and websub-callback.
 * Extracted to avoid code duplication across edge functions.
 */

import { XMLParser } from "https://esm.sh/fast-xml-parser@4.5.3";

// =====================================================
// CONSTANTS
// =====================================================

export const MAX_EPISODES = 10;
export const LARGE_XML_THRESHOLD = 300_000;
export const LARGE_FEED_PRETRUNCATE_THRESHOLD = 2_000_000; // 2MB
export const ERROR_SNIPPET_LEN = 200;

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeUrl(u: string): string {
  const s = (u || "").trim();
  if (!s) return s;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return `https://${s}`;
}

export function safeStr(x: any): string | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  return s.length ? s : null;
}

/** Extract text from fast-xml-parser nodes that may be objects with #text attribute */
export function extractTextNode(x: any): string | null {
  if (x === null || x === undefined) return null;
  if (typeof x === 'string' || typeof x === 'number') {
    const s = String(x).trim();
    return s.length ? s : null;
  }
  if (typeof x === 'object') {
    const t = x['#text'] ?? x['_'] ?? x['text'] ?? null;
    if (t !== null && t !== undefined) {
      const s = String(t).trim();
      return s.length ? s : null;
    }
  }
  return null;
}

export function extractGuidText(x: any): string | null {
  const s = extractTextNode(x);
  if (!s || s === '[object Object]') return null;
  return s;
}

export function safeDateToIso(raw: any): string | null {
  const s = safeStr(raw);
  if (!s) return null;

  // Try standard Date parsing first
  let d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();

  // Try RFC 822 format manually (common in RSS)
  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  const rfc822Match = s.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([\+\-]\d{4}|GMT|UTC|[A-Z]{3})?/i);
  if (rfc822Match) {
    const day = parseInt(rfc822Match[1]);
    const month = monthMap[rfc822Match[2].toLowerCase()];
    const year = parseInt(rfc822Match[3]);
    const hour = parseInt(rfc822Match[4]);
    const min = parseInt(rfc822Match[5]);
    const sec = parseInt(rfc822Match[6] || '0');

    if (month !== undefined && !isNaN(day) && !isNaN(year)) {
      d = new Date(Date.UTC(year, month, day, hour, min, sec));
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }

  // Try ISO 8601 variants
  const isoMatch = s.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1]);
    const month = parseInt(isoMatch[2]) - 1;
    const day = parseInt(isoMatch[3]);
    const hour = parseInt(isoMatch[4] || '0');
    const min = parseInt(isoMatch[5] || '0');
    const sec = parseInt(isoMatch[6] || '0');

    d = new Date(Date.UTC(year, month, day, hour, min, sec));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  console.warn(`[rss-parser] Failed to parse date: "${s.substring(0, 50)}"`);
  return null;
}

export function parseItunesDuration(raw: any): number | null {
  const s = safeStr(raw);
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const parts = s.split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function firstArray<T>(x: T | T[] | undefined | null): T | null {
  if (x === null || x === undefined) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export function asArray<T>(x: T | T[] | undefined | null): T[] {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

// =====================================================
// FEED DETECTION AND TRUNCATION
// =====================================================

export function detectFeedType(xml: string): "rss" | "atom" | "unknown" {
  const head = xml.slice(0, 2000).toLowerCase();
  if (head.includes("<rss")) return "rss";
  if (head.includes("<feed") && head.includes("atom")) return "atom";
  if (head.includes("<feed")) return "atom";
  return "unknown";
}

export function truncateRssToFirstNItems(xml: string, n: number): { truncatedXml: string; copied: number } {
  const rssOpenMatch = xml.match(/<rss\b[^>]*>/i);
  const channelOpenMatch = xml.match(/<channel\b[^>]*>/i);
  if (!rssOpenMatch || !channelOpenMatch) return { truncatedXml: xml, copied: 0 };

  const rssOpen = rssOpenMatch[0];
  const channelOpen = channelOpenMatch[0];

  const items = Array.from(xml.matchAll(/<item\b[^>]*>[\s\S]*?<\/item>/gi)).map((m) => m[0]);
  const take = items.slice(0, n);
  const copied = take.length;

  const rebuilt = `${rssOpen}${channelOpen}${take.join("")}</channel></rss>`;
  return { truncatedXml: rebuilt, copied };
}

export function truncateAtomToFirstNEntries(xml: string, n: number): { truncatedXml: string; copied: number } {
  const feedOpenMatch = xml.match(/<feed\b[^>]*>/i);
  if (!feedOpenMatch) return { truncatedXml: xml, copied: 0 };

  const feedOpen = feedOpenMatch[0];
  const entries = Array.from(xml.matchAll(/<entry\b[^>]*>[\s\S]*?<\/entry>/gi)).map((m) => m[0]);
  const take = entries.slice(0, n);
  const copied = take.length;

  const rebuilt = `${feedOpen}${take.join("")}</feed>`;
  return { truncatedXml: rebuilt, copied };
}

export function makeXmlParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: false,
    allowBooleanAttributes: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
  });
}

// =====================================================
// FEED EXTRACTION
// =====================================================

/** Extract owner email from RSS channel (itunes:owner/itunes:email or managingEditor) */
export function extractOwnerEmail(channel: any): string | null {
  const itunesOwner = channel?.["itunes:owner"];
  const itunesEmail = safeStr(itunesOwner?.["itunes:email"]);
  if (itunesEmail) return itunesEmail;

  const managingEditor = safeStr(channel?.managingEditor);
  if (managingEditor) {
    const emailMatch = managingEditor.match(/([^\s<>()]+@[^\s<>()]+)/);
    if (emailMatch) return emailMatch[1];
  }
  return null;
}

export function extractRssShow(parsed: any) {
  const channel = parsed?.rss?.channel ?? parsed?.channel;
  if (!channel) return null;

  const title = safeStr(channel.title);
  const description = extractTextNode(channel.description) ?? extractTextNode(channel["itunes:summary"]);
  const publisher = safeStr(channel["itunes:author"]) ?? safeStr(channel.managingEditor);
  const link = safeStr(channel.link);
  const itunesImageHref = safeStr(channel["itunes:image"]?.["@_href"]);
  const artwork = itunesImageHref ?? safeStr(channel.image?.url);
  const ownerEmail = extractOwnerEmail(channel);

  const categories = asArray(channel.category).map((c: any) => safeStr(c?.["@_text"] ?? c)).filter(Boolean);

  return { channel, title, description, publisher, link, artwork, categories, ownerEmail };
}

export function extractRssItems(channel: any) {
  const items = asArray(channel?.item);
  return items;
}

export function extractAtomFeed(parsed: any) {
  const feed = parsed?.feed;
  if (!feed) return null;

  const title = safeStr(feed.title);
  const description = extractTextNode(feed.subtitle) ?? null;

  const author = firstArray(feed.author);
  const publisher = safeStr(author?.name) ?? safeStr(author);

  const links = asArray(feed.link);
  const alt = links.find((l: any) => l?.["@_rel"] === "alternate") ?? links[0];
  const link = safeStr(alt?.["@_href"]) ?? safeStr(alt);

  const logo = safeStr(feed.logo);
  const artwork = logo ?? null;

  return { feed, title, description, publisher, link, artwork };
}

export function extractAtomEntries(feed: any) {
  return asArray(feed?.entry);
}

export function pickAtomEnclosure(entry: any): { audioUrl: string | null; audioType: string | null } {
  const links = asArray(entry?.link);
  const enc = links.find((l: any) => l?.["@_rel"] === "enclosure") ?? null;
  const audioUrl = safeStr(enc?.["@_href"]);
  const audioType = safeStr(enc?.["@_type"]);
  return { audioUrl, audioType };
}

/** Parse publisher string into individual host names */
export function parseHostNames(publisher: string | null): Array<{ name: string; role: string }> {
  if (!publisher) return [];

  const separators = /\s*(?:&|,|\sand\s|\/)\s*/gi;
  const names = publisher.split(separators)
    .map(name => name.trim())
    .filter(name => name.length > 0 && name.length < 100);

  const uniqueNames = [...new Set(names)];

  return uniqueNames.map(name => ({ name, role: "Host" }));
}

/** Calculate fetch tier based on show's last episode date */
export function calculateFetchTier(lastEpisodeAt: string | null): { tier: string; intervalHours: number } {
  if (!lastEpisodeAt) return { tier: 'normal', intervalHours: 12 };

  const lastEp = new Date(lastEpisodeAt);
  const now = new Date();
  const daysSinceLastEp = (now.getTime() - lastEp.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceLastEp <= 7) return { tier: 'active', intervalHours: 4 };
  if (daysSinceLastEp <= 30) return { tier: 'normal', intervalHours: 12 };
  if (daysSinceLastEp <= 90) return { tier: 'slow', intervalHours: 24 };
  return { tier: 'dormant', intervalHours: 168 }; // 7 days
}

// =====================================================
// WEBSUB HUB DETECTION HELPERS
// =====================================================

/** Extract WebSub hub URL from XML content (checks <atom:link rel="hub">) */
export function extractHubFromXml(xml: string): string | null {
  const patterns = [
    /<(?:atom:)?link[^>]*rel\s*=\s*["']hub["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*\/?>/i,
    /<(?:atom:)?link[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']hub["'][^>]*\/?>/i,
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Extract WebSub hub URL from HTTP Link header */
export function extractHubFromHeaders(headers: Headers): string | null {
  const linkHeader = headers.get("link");
  if (!linkHeader) return null;
  const m = linkHeader.match(/<([^>]+)>\s*;\s*rel\s*=\s*["']?hub["']?/i);
  return m?.[1] ?? null;
}

/** Extract the <atom:link rel="self"> URL from a parsed RSS channel object */
export function extractSelfUrl(channel: any): string | null {
  const links = asArray(channel?.['atom:link'] ?? channel?.link);
  for (const l of links) {
    if (typeof l === 'object' && l?.['@_rel'] === 'self') {
      return safeStr(l['@_href']) ?? null;
    }
  }
  return null;
}

/** Extract canonical feed URL from Podroll redirect URLs (rss.pdrl.fm) */
export function extractCanonicalFromPodroll(rssUrl: string): string | null {
  const match = rssUrl.match(/^https:\/\/rss\.pdrl\.fm\/[^/]+\/(.+)$/);
  return match ? 'https://' + match[1] : null;
}
