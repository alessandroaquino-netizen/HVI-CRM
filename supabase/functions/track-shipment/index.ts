// Supabase Edge Function: looks up a shipment with EasyPost and returns the raw tracker.
// The app normalises it (src/tracking/status.js) and stores it on the product.
// Deploy:  supabase functions deploy track-shipment   then   supabase secrets set EASYPOST_API_KEY=...
// The caller must be a signed-in user (verify_jwt is on by default for Edge Functions). See docs/shipment-tracking.md.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const key = Deno.env.get("EASYPOST_API_KEY");
    if (!key) return json({ error: "Tracking is not set up yet: the EASYPOST_API_KEY secret is missing." }, 503);
    const { trackingNumber, carrier } = await req.json();
    const code = String(trackingNumber ?? "").replace(/\s+/g, "");
    if (!code) return json({ error: "No tracking number." }, 400);
    // Creating a tracker for a code that already exists returns the existing one with its latest events.
    const tracker: Record<string, string> = { tracking_code: code };
    if (carrier) tracker.carrier = carrier;            // omit to let EasyPost detect the carrier
    const res = await fetch("https://api.easypost.com/v2/trackers", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Basic " + btoa(key + ":") },
      body: JSON.stringify({ tracker }),
    });
    const body = await res.json();
    if (!res.ok) return json({ error: body?.error?.message ?? `EasyPost error ${res.status}` }, 502);
    return json({ tracker: body });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
