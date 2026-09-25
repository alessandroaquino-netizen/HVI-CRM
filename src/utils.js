// Display-only date formatting — month-day-year, never leading with year.
// Never use this for <input type="date"> values, which must stay ISO (YYYY-MM-DD).
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
