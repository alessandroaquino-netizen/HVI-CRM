// One place for the product name. "CRM" now names only the sales side (Pipeline, Leads, Follow-ups); the whole system is the Hub.
export const APP_NAME = 'HVI Hub';
export const IS_TEST_ENV = (import.meta.env.VITE_SUPABASE_URL || '').includes('ymzeklhdzpmaakvlxrkx');

/** Browser tab: name, plus a [TEST] prefix and an amber "T" icon on the test site so the two tabs can't be confused. */
export function applyTabIdentity() {
  document.title = IS_TEST_ENV ? `[TEST] ${APP_NAME}` : APP_NAME;
  if (IS_TEST_ENV) {
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#FFB500'/><text x='32' y='47' font-size='42' font-family='Arial,sans-serif' font-weight='700' text-anchor='middle' fill='#0A0A0A'>T</text></svg>";
    document.querySelectorAll("link[rel='icon']").forEach(l => { l.type = 'image/svg+xml'; l.href = 'data:image/svg+xml,' + encodeURIComponent(svg); });
  }
  const t = document.querySelector("meta[name='apple-mobile-web-app-title']"); if (t) t.content = IS_TEST_ENV ? `TEST ${APP_NAME}` : APP_NAME;
  document.querySelectorAll('[data-app-name]').forEach(n => { n.textContent = APP_NAME; });
}
