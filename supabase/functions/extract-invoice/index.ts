// Supabase Edge Function: reads an invoice that the rules parser cannot (PDF, scanned image, unusual layout)
// and returns the SAME JSON shape as src/invoices/parse.js, so the review screen works unchanged.
// Deploy:  supabase functions deploy extract-invoice   then   supabase secrets set ANTHROPIC_API_KEY=...
// The caller must be a signed-in user (verify_jwt is on by default for Edge Functions).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MODEL = Deno.env.get("INVOICE_MODEL") ?? "claude-sonnet-5-5";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const PROMPT = `You extract data from a supplier invoice or pro-forma invoice. Return ONLY a JSON object, no prose:
{
 "docType": "proforma" | "final" | "other",
 "invoiceNumber": string, "invoiceDate": "YYYY-MM-DD" or "", "vendor": string, "currency": "USD",
 "refs": [order references such as HVI2626],
 "lines": [{ "description": string, "lineType": "product"|"photography"|"shipping"|"sample_fee"|"fee"|"other",
             "quantity": number|null, "unitPrice": number|null, "amount": number, "packedQuantity": number|null }],
 "totals": { "quantity": number|null, "amount": number|null, "deposits": [{ "ref": string, "amount": number }], "overpaid": number, "balance": number|null },
 "packing": [{ "description": string, "pieces": number }]
}
Rules: copy descriptions exactly as written. Never invent a number; if a field is not on the document use null or "". lineType "shipping" covers courier, freight, duty and customs;
"fee" covers tooling, setup, bagging, tagging, labels or reprint charges. Amounts are in the document currency. If a line has quantity and unit price, amount must equal their product.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { fileName, mimeType, base64 } = await req.json();
    if (!base64) throw new Error("No file received.");
    const isPdf = mimeType === "application/pdf";
    const block = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: mimeType.startsWith("image/") ? mimeType : "image/png", data: base64 } };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: "user", content: [block, { type: "text", text: `${PROMPT}\n\nFile name: ${fileName}` }] }] }),
    });
    if (!res.ok) throw new Error(`Model API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const text = (await res.json()).content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));

    // Same safety net as the rules parser: arithmetic must reconcile, otherwise say so.
    const warnings: { level: string; msg: string }[] = [{ level: "warn", msg: "Read by AI: check every amount against the original before saving." }];
    const sum = Math.round(json.lines.reduce((a: number, l: { amount: number }) => a + Number(l.amount || 0), 0) * 100) / 100;
    if (json.totals?.amount != null && Math.abs(sum - json.totals.amount) > 0.05) warnings.push({ level: "error", msg: `Line amounts add up to ${sum} but the document total is ${json.totals.amount}.` });
    for (const l of json.lines) if (l.quantity != null && l.unitPrice != null && Math.abs(l.quantity * l.unitPrice - l.amount) > 0.05) warnings.push({ level: "warn", msg: `"${l.description}": quantity × unit price does not equal the amount.` });

    const deposits = json.totals?.deposits ?? [];
    const out = {
      ok: true, docType: json.docType ?? "final", invoiceNumber: json.invoiceNumber ?? fileName, invoiceNumberRaw: json.invoiceNumber ?? "", invoiceDate: json.invoiceDate ?? "",
      vendor: json.vendor ?? "", manufacturerGuess: /bing\s*bing|thor/i.test(json.vendor ?? "") ? "bing-bing" : "", currency: json.currency ?? "USD",
      refs: json.refs ?? [], lines: json.lines.map((l: Record<string, unknown>) => ({ ...l, cartons: null, productHint: l.description, inferred: false, genericDescription: false, section: "" })),
      totals: { quantity: json.totals?.quantity ?? null, amount: json.totals?.amount ?? null, deposits, deposit: deposits.reduce((a: number, d: { amount: number }) => a + d.amount, 0), overpaid: json.totals?.overpaid ?? 0, balance: json.totals?.balance ?? null },
      packing: json.packing ?? [], warnings, sheetNames: [], hasPackingList: !!json.packing?.length,
    };
    return new Response(JSON.stringify(out), { headers: { ...cors, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "content-type": "application/json" } });
  }
});
