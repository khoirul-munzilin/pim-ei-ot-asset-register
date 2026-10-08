import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ ok: false, error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GITHUB_PAT = Deno.env.get("REPORT_GITHUB_PAT")!;
    const GITHUB_OWNER = Deno.env.get("REPORT_GITHUB_OWNER") || "khoirul-munzilin";
    const GITHUB_REPO = Deno.env.get("REPORT_GITHUB_REPO") || "pim-ei-ot-asset-register";

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return respond({ ok: false, error: "Login diperlukan" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return respond({ ok: false, error: "Session tidak valid" }, 401);
    if (String(data.user.email || "").toLowerCase() !== "smartworkreport@gmail.com") {
      return respond({ ok: false, error: "Hanya Administrator yang dapat mengirim laporan" }, 403);
    }
    if (!GITHUB_PAT) return respond({ ok: false, error: "REPORT_GITHUB_PAT belum diset" }, 500);

    const payload = await req.json().catch(() => ({}));
    const recipient = String(payload.recipient || "");
    if (!recipient.includes("@")) return respond({ ok: false, error: "Email penerima tidak valid" }, 400);

    const githubResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`,
      {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${GITHUB_PAT}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: "manual-asset-report",
          client_payload: {
            recipient,
            area_group: payload.filters?.area_group || "",
            functional_location: payload.filters?.functional_location || "",
            category: payload.filters?.category || "",
            requested_by: data.user.email,
          },
        }),
      },
    );

    if (!githubResponse.ok) {
      const detail = await githubResponse.text();
      return respond({ ok: false, error: `GitHub dispatch gagal (${githubResponse.status}): ${detail}` }, 502);
    }

    return respond({ ok: true, queued: true, recipient, assets: 0, photos: 0 });
  } catch (error) {
    return respond({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
