import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// =====================================================
// AUTH: Extract verified user ID from JWT
// =====================================================

/**
 * Extract the authenticated user's ID from the request Authorization header.
 * Creates a lightweight Supabase client with the user's JWT and validates it
 * against the auth service. Returns null if unauthenticated.
 */
export async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return null;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return null;
  return user.id;
}

// =====================================================
// RATE LIMITING: Simple in-memory IP-based limiter
// Persists within a warm isolate; resets on cold start.
// Not distributed, but catches rapid-fire abuse.
// =====================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Periodic cleanup to prevent memory leaks in long-lived isolates
let lastCleanup = Date.now();
function cleanupExpired() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return; // Clean at most once per minute
  lastCleanup = now;
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(key);
  }
}

/**
 * Check if a request is within the rate limit.
 * @param key - Unique key (typically IP + function name)
 * @param maxRequests - Max requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns true if allowed, false if rate-limited
 */
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  cleanupExpired();
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Extract a client IP from request headers for rate limiting.
 * Checks common proxy headers, falls back to "unknown".
 */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

// =====================================================
// LOGGING: Mask PII in log output
// =====================================================

/**
 * Mask an email address for safe logging.
 * "john.doe@gmail.com" -> "jo***@gmail.com"
 */
export function maskEmail(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2) return "***";
  const [local, domain] = parts;
  const masked = local.length > 2
    ? local.substring(0, 2) + "***"
    : local[0] + "***";
  return `${masked}@${domain}`;
}
