import { SEASONAL_WINDOWS, KEY_DATES, PRODUCT_TYPES, calcDropRisk } from '../dtc_constants.js';

function todayStr() { return new Date().toISOString().slice(0, 10); }
function addWeeks(dateStr, weeks) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - weeks * 7);
  return d.toISOString().slice(0, 10);
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function dateToPercent(dateStr, year, month) {
  const d = new Date(dateStr);
  if (d.getFullYear() !== year || d.getMonth() !== month) return null;
  const total = daysInMonth(year, month);
  return ((d.getDate() - 1) / total) * 100;
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

export function renderDtcCalendar(products) {
  const el = document.getElementById('dtcCalendarView');
  if (!el) return;

  const today = todayStr();
  const currentYear = new Date().getFullYear();

  // Month nav state
  const startMonth = el._calStart ?? new Date().getMonth();
  el._calStart = startMonth;

  const months = Array.from({ length: 12 }, (_, i) => ({
    year: currentYear + Math.floor((startMonth + i) / 12),
    month: (startMonth + i) % 12,
  }));

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Build product bars — start date estimated from drop_date - lead time
  const productsWithDates = products
    .filter(p => p.drop_date)
    .map(p => {
      const type = PRODUCT_TYPES.find(t => t.id === p.product_type);
      const startDate = type?.totalWeeks ? addWeeks(p.drop_date, type.totalWeeks) : null;
      return { ...p, startDate, risk: calcDropRisk(p) };
    });

  let html = `
    <!-- Legend -->
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:1.25rem;flex-wrap:wrap">
      <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.06em">Legend:</span>
      <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)"><span style="width:12px;height:12px;border-radius:2px;background:var(--accent);opacity:.7;display:inline-block"></span>Drop date</span>
      <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)"><span style="width:24px;height:8px;border-radius:2px;background:var(--green);opacity:.5;display:inline-block"></span>Production window (on track)</span>
      <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)"><span style="width:24px;height:8px;border-radius:2px;background:var(--red);opacity:.5;display:inline-block"></span>At risk / overdue</span>
      <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)"><span style="width:24px;height:8px;border-radius:2px;background:var(--blue);opacity:.18;display:inline-block"></span>Seasonal window</span>
    </div>

    <!-- Seasonal key dates strip -->
    <div style="margin-bottom:1rem;display:flex;gap:8px;flex-wrap:wrap">
      ${KEY_DATES.filter(k => !k.month).map(k =>
        `<span style="font-size:10px;font-family:var(--mono);padding:2px 8px;border-radius:3px;background:rgba(0,0,0,.3);border:1px solid #${k.color}40;color:#${k.color}">
          📅 ${k.label} · ${k.date}
        </span>`
      ).join('')}
    </div>

    <!-- Calendar grid -->
    <div style="display:flex;flex-direction:column;gap:12px">
      ${months.map(({ year, month }) => {
        const days = daysInMonth(year, month);
        const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
        const isCurrentMonth = today.startsWith(monthStr);

        // Seasonal windows overlapping this month
        const seasonals = SEASONAL_WINDOWS.filter(s => s.start.slice(0,7) <= monthStr && s.end.slice(0,7) >= monthStr);

        // Key dates in this month
        const keyDatesThisMonth = KEY_DATES.filter(k => k.date?.slice(0,7) === monthStr || (k.month && k.date?.slice(0,7) === monthStr));
        const monthKeyDates = KEY_DATES.filter(k => k.month && k.date?.slice(5,7) === String(month+1).padStart(2,'0'));

        // Products with activity in this month
        const monthProducts = productsWithDates.filter(p => {
          const start = p.startDate || p.drop_date;
          const end   = p.drop_date;
          if (!start || !end) return false;
          return start.slice(0,7) <= monthStr && end.slice(0,7) >= monthStr;
        });

        // Month seasonal bg color (first seasonal window)
        const primarySeasonal = seasonals[0];
        const bgColor = primarySeasonal
          ? `rgba(${parseInt(primarySeasonal.color.slice(0,2),16)},${parseInt(primarySeasonal.color.slice(2,4),16)},${parseInt(primarySeasonal.color.slice(4,6),16)},${primarySeasonal.opacity})`
          : 'var(--bg2)';

        return `
          <div style="background:${bgColor};border:1px solid ${isCurrentMonth ? 'var(--accent)' : 'var(--border)'};border-radius:var(--radius-lg);overflow:hidden">
            <!-- Month header -->
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--bg2)">
              <div style="display:flex;align-items:center;gap:10px">
                <span style="font-size:14px;font-weight:500;color:${isCurrentMonth ? 'var(--accent)' : 'var(--text)'}">${MONTH_NAMES[month]} ${year}</span>
                ${isCurrentMonth ? `<span style="font-size:9px;font-family:var(--mono);background:var(--accent);color:#111;padding:1px 6px;border-radius:3px">TODAY</span>` : ''}
                ${seasonals.map(s => `<span style="font-size:9px;font-family:var(--mono);color:#${s.color};opacity:.8">${s.label}</span>`).join(' · ')}
                ${monthKeyDates.map(k => `<span style="font-size:9px;font-family:var(--mono);padding:1px 6px;border-radius:3px;border:1px solid #${k.color}60;color:#${k.color}">${k.label}</span>`).join('')}
              </div>
              <span style="font-size:11px;color:var(--text3)">${monthProducts.length} product${monthProducts.length !== 1 ? 's' : ''}</span>
            </div>

            <!-- Day ruler -->
            <div style="position:relative;padding:6px 14px 4px">
              <div style="position:relative;height:16px">
                <!-- Today line -->
                ${isCurrentMonth ? (() => {
                  const todayDay = new Date().getDate();
                  const pct = ((todayDay - 1) / days) * 100;
                  return `<div style="position:absolute;left:${pct}%;top:0;bottom:0;width:2px;background:var(--accent);z-index:10;opacity:.8"></div>`;
                })() : ''}
                <!-- Key date pins -->
                ${KEY_DATES.filter(k => !k.month && k.date?.slice(0,7) === monthStr).map(k => {
                  const pct = dateToPercent(k.date, year, month);
                  if (pct === null) return '';
                  return `<div title="${k.label}" style="position:absolute;left:${pct}%;top:2px;width:6px;height:6px;border-radius:50%;background:#${k.color};transform:translateX(-50%);z-index:11"></div>`;
                }).join('')}
                <!-- Day ticks -->
                ${[1,8,15,22,28].map(d => {
                  const pct = ((d-1)/days)*100;
                  return `<span style="position:absolute;left:${pct}%;font-size:8px;font-family:var(--mono);color:var(--text3);transform:translateX(-50%)">${d}</span>`;
                }).join('')}
              </div>
            </div>

            <!-- Product bars -->
            <div style="padding:2px 14px 10px;display:flex;flex-direction:column;gap:5px">
              ${monthProducts.length ? monthProducts.map(p => {
                const barStart = p.startDate && p.startDate.slice(0,7) <= monthStr ? p.startDate : `${monthStr}-01`;
                const barEnd   = p.drop_date.slice(0,7) >= monthStr ? p.drop_date : `${monthStr}-${String(days).padStart(2,'0')}`;

                const startPct = dateToPercent(barStart, year, month) ?? 0;
                const endPct   = dateToPercent(barEnd,   year, month) ?? 100;
                const dropPct  = dateToPercent(p.drop_date, year, month);

                const barColor = p.risk === 'overdue' ? 'var(--red)' : p.risk === 'at-risk' ? 'var(--accent)' : 'var(--green)';
                const left  = clamp(startPct, 0, 100);
                const width = clamp(endPct - startPct, 1, 100 - left);

                return `<div style="position:relative;height:22px">
                  <div style="position:absolute;left:${left}%;width:${width}%;height:14px;top:4px;border-radius:3px;background:${barColor};opacity:.5"></div>
                  <div style="position:absolute;left:${left}%;top:5px;font-size:10px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:${width}%;padding:0 4px;font-weight:500">${p.name}</div>
                  ${dropPct !== null ? `<div title="Drop: ${p.drop_date}" style="position:absolute;left:calc(${dropPct}% - 4px);top:2px;width:8px;height:18px;border-left:2px solid var(--accent);background:rgba(240,192,64,.2);border-radius:1px"></div>` : ''}
                </div>`;
              }).join('') : `<div style="font-size:11px;color:var(--text3);padding:2px 0">No products scheduled this month</div>`}
            </div>
          </div>`;
      }).join('')}
    </div>`;

  el.innerHTML = html;
}
