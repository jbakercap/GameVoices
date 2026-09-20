import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { checkRateLimit, getClientIp, maskEmail } from "../_shared/security.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function generateToken(): string {
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

interface ClaimRequest {
  show_id: string;
  verification_method: "self_attestation" | "email";
}

interface ClaimResponse {
  ok: boolean;
  claim_id?: string;
  email_sent_to?: string;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[send-claim-verification] Request received");

  try {
    // Extract user_id from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized – please sign in" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      console.error("[send-claim-verification] Auth failed:", userError?.message);
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized – invalid session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const user_id = user.id;

    // Rate limit — 10 claim attempts per IP per hour
    const ip = getClientIp(req);
    if (!checkRateLimit(`claim:${ip}`, 10, 60 * 60 * 1000)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Too many requests. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      console.error("[send-claim-verification] Missing Supabase env vars");
      return new Response(
        JSON.stringify({ ok: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const body: ClaimRequest = await req.json();
    const { show_id, verification_method } = body;

    if (!show_id || !verification_method) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["self_attestation", "email"].includes(verification_method)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid verification method" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get show details
    const { data: show, error: showError } = await supabase
      .from("shows")
      .select("id, title, rss_url, claim_status, owner_email")
      .eq("id", show_id)
      .single();

    if (showError || !show) {
      return new Response(
        JSON.stringify({ ok: false, error: "Show not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (show.claim_status === "claimed") {
      return new Response(
        JSON.stringify({ ok: false, error: "This show has already been claimed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==========================================
    // SELF ATTESTATION — instant claim
    // ==========================================
    if (verification_method === "self_attestation") {
      const { data: claim, error: claimError } = await supabase
        .from("podcast_claims")
        .insert({
          show_id,
          user_id,
          verification_method: "self_attestation",
          verification_token: generateToken(),
          status: "approved",
          submitted_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (claimError) {
        console.error("[send-claim-verification] Claim insert error:", claimError);
        return new Response(
          JSON.stringify({ ok: false, error: "Failed to create claim" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Immediately mark the show as claimed
      await supabase
        .from("shows")
        .update({
          claim_status: "claimed",
          claimed_by_user_id: user_id,
          claimed_at: new Date().toISOString(),
        })
        .eq("id", show_id);

      console.log(`[send-claim-verification] Instant claim approved: ${claim.id}`);

      return new Response(
        JSON.stringify({ ok: true, claim_id: claim.id } as ClaimResponse),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==========================================
    // EMAIL — optional verification badge upgrade
    // ==========================================
    const feedEmail = show.owner_email;
    if (!feedEmail) {
      return new Response(
        JSON.stringify({ ok: false, error: "no_owner_email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const verificationToken = generateToken();

    const { data: claim, error: claimError } = await supabase
      .from("podcast_claims")
      .insert({
        show_id,
        user_id,
        verification_method: "email",
        verification_token: verificationToken,
        status: "pending",
        submitted_at: new Date().toISOString(),
        verification_sent_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (claimError) {
      console.error("[send-claim-verification] Claim insert error:", claimError);
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to create claim" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send verification email
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const appUrl = Deno.env.get("APP_URL");

    if (!resendApiKey || !appUrl) {
      console.error("[send-claim-verification] Email config missing");
      return new Response(
        JSON.stringify({ ok: true, claim_id: claim.id, error: "Email service not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(resendApiKey);
    const verifyUrl = `${appUrl}/verify-claim?token=${verificationToken}`;

    try {
      await resend.emails.send({
        from: "GameVoices <noreply@resend.dev>",
        to: [feedEmail],
        subject: `Verify your ownership of "${show.title}"`,
        html: `
          <h1>Podcast Ownership Verification</h1>
          <p>Someone has requested to verify ownership of <strong>"${show.title}"</strong> on GameVoices.</p>
          <p>Click below to verify and earn a Verified badge:</p>
          <p>
            <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 6px;">
              Verify Ownership
            </a>
          </p>
          <p>Or copy and paste this link: ${verifyUrl}</p>
          <p>This link expires in 7 days.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">GameVoices - The Podcast Platform for Sports Fans</p>
        `,
      });
      console.log(`[send-claim-verification] Email sent to ${maskEmail(feedEmail)}`);
    } catch (e) {
      console.error("[send-claim-verification] Email send error:", e);
    }

    const maskedEmail = `${feedEmail.substring(0, 3)}***@${feedEmail.split("@")[1]}`;

    return new Response(
      JSON.stringify({ ok: true, claim_id: claim.id, email_sent_to: maskedEmail } as ClaimResponse),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[send-claim-verification] Error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
