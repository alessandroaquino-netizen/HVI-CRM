// Supabase Edge Function: reads an email thread (text, or a PDF printed from Gmail) and returns the dated milestones
// it mentions, in the same shape as src/emailDates/parse.js, so the review screen works unchanged.
// Deploy:  supabase functions deploy extract-email-dates   then   supabase secrets set ANTHROPIC_API_KEY=...
// The caller must be a signed-in user (verify_jwt is on by default). Nothing is saved here: the app shows the result for confirmation.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MODEL = Deno.env.get("EMAIL_DATES_MODEL") ?? "claude-sonnet-5-5";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const PROMPT = `You read an email thread between a clothing brand (High Voltage Industries) and its manufacturer or carrier, and list the dated production milestones it states.
Return ONLY a JSON object, no prose:
{
 "events": [{ "kind": "order_placed"|"sampling_start"|"sampling_end"|"production_start"|"production_end"|"shipped"|"delivery_eta"|"design_end",
              "date": "YYYY-MM-DD", "quote": the exact sentence the date comes from, "confidence": "high"|"medium"|"low" }],
 "tracking": [{ "number": string, "carrier": "fedex"|"ups"|"dhl"|"usps"|"other" }],
 "product": the product or order reference the thread is about (e.g. "HVI2621 Red Flannel") or ""
}
Rules: use the date the email states for the event, not the date it was sent, unless the email says "today" or "yesterday" (then use the email's own sent date). Resolve dates without a year using the year of the email.
"production_start" is when bulk production begins or is said to be starting ("moving into production"). "sampling_end" is when samples are approved or sent. "shipped" is the departure or dispatch date. "delivery_eta" is an expected arrival date.
Never invent a date. If the thread states none, return "events": []. Quote the source sentence exactly.`;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { text, base64, mimeType, fileName } = await req.json();
    const today = new Date().toISOString().slice(0, 10);
    const content: unknown[] = [];
    if (text) content.push({ type: "text", text: `EMAIL THREAD:\n${String(text).slice(0, 120000)}` });
    else if (base64 && mimeType === "application/pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } });
    else throw new Error("Send the email text, or a PDF.");
    content.push({ type: "text", text: `${PROMPT}\n\nToday is ${today}. File name: ${fileName ?? "pasted text"}` });
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 3000, messages: [{ role: "user", content }] }),
    });
    if (!res.ok) throw new Error(`Model API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const out = (await res.json()).content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
    const parsed = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
    const kinds = new Set(["order_placed", "sampling_start", "sampling_end", "production_start", "production_end", "shipped", "delivery_eta", "design_end"]);
    const events = (parsed.events ?? []).filter((e: { kind: string; date: string }) => kinds.has(e.kind) && /^\d{4}-\d{2}-\d{2}$/.test(e.date));
    return json({ events, tracking: parsed.tracking ?? [], product: parsed.product ?? "", source: "ai" });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
