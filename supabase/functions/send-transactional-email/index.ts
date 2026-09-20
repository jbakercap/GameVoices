import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { Resend } from "https://esm.sh/resend@2.0.0";
import {
  claimApprovedEmail,
  claimRejectedEmail,
  submissionApprovedEmail,
  submissionRejectedEmail,
  welcomeEmail,
} from "../_shared/email-templates.ts";
import { maskEmail } from "../_shared/security.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type EmailType = 
  | "claim_approved" 
  | "claim_rejected" 
  | "submission_approved" 
  | "submission_rejected"
  | "welcome";

interface EmailRequest {
  email_type: EmailType;
  user_id?: string;
  to_email?: string; // Direct email for testing
  show_id?: string;
  show_title?: string;
  rejection_reason?: string;
}

interface EmailResponse {
  ok: boolean;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[send-transactional-email] Request received");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const appUrl = Deno.env.get("APP_URL") || "https://peer-onc-listen.lovable.app";

    if (!supabaseUrl || !serviceKey) {
      console.error("[send-transactional-email] Missing Supabase env vars");
      return new Response(
        JSON.stringify({ ok: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!resendApiKey) {
      console.error("[send-transactional-email] Missing RESEND_API_KEY");
      return new Response(
        JSON.stringify({ ok: false, error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const resend = new Resend(resendApiKey);
    
    const body: EmailRequest = await req.json();
    const { email_type, user_id, to_email, show_id, show_title, rejection_reason } = body;

    console.log(`[send-transactional-email] Type: ${email_type}, User: ${user_id || 'N/A'}, Show: ${show_id || 'N/A'}`);

    if (!email_type || (!user_id && !to_email)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing required fields: email_type and (user_id or to_email)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let userEmail: string;

    // If direct email provided (for testing), use it; otherwise look up user
    if (to_email) {
      userEmail = to_email;
      console.log(`[send-transactional-email] Using direct email: ${maskEmail(userEmail)}`);
    } else {
      // Get user email from auth.users
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(user_id!);

      if (userError || !userData?.user?.email) {
        console.error("[send-transactional-email] Failed to get user email:", userError);
        return new Response(
          JSON.stringify({ ok: false, error: "User email not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userEmail = userData.user.email;
    }

    console.log(`[send-transactional-email] Sending to: ${maskEmail(userEmail)}`);

    let subject: string;
    let html: string;
    const title = show_title || "your podcast";

    switch (email_type) {
      case "claim_approved": {
        const manageUrl = show_id 
          ? `${appUrl}/manage/${show_id}` 
          : `${appUrl}/my-podcasts`;
        subject = `You now own ${title} on GameVoices`;
        html = claimApprovedEmail(title, manageUrl);
        break;
      }

      case "claim_rejected": {
        subject = `Update on your claim for ${title}`;
        html = claimRejectedEmail(title, rejection_reason);
        break;
      }

      case "submission_approved": {
        const showUrl = show_id ? `${appUrl}/show/${show_id}` : appUrl;
        const manageUrl = show_id ? `${appUrl}/manage/${show_id}` : `${appUrl}/my-podcasts`;
        subject = `${title} is now live on GameVoices`;
        html = submissionApprovedEmail(title, showUrl, manageUrl);
        break;
      }

      case "submission_rejected": {
        subject = "Update on your podcast submission";
        html = submissionRejectedEmail(show_title || null, rejection_reason);
        break;
      }

      case "welcome": {
        subject = "Welcome to GameVoices!";
        html = welcomeEmail(appUrl);
        break;
      }

      default:
        return new Response(
          JSON.stringify({ ok: false, error: "Invalid email type" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    try {
      const result = await resend.emails.send({
        from: "GameVoices <noreply@resend.dev>",
        to: [userEmail],
        subject,
        html,
      });

      console.log(`[send-transactional-email] Email sent successfully:`, result);

      return new Response(
        JSON.stringify({ ok: true } as EmailResponse),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (emailError) {
      console.error("[send-transactional-email] Resend error:", emailError);
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to send email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error) {
    console.error("[send-transactional-email] Error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
