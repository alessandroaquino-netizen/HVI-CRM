import { SEASONAL_WINDOWS, KEY_DATES, calcDropRisk } from '../dtc_constants.js';

function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function seasonalTint(dateStr) {
  const s = SEASONAL_WINDOWS.find(w => dateStr >= w.start && dateStr <= w.end);
  if (!s) return null;
  const r = parseInt(s.color.slice(0,2),16), g = parseInt(s.color.slice(2,4),16), b = parseInt(s.color.slice(4,6),16);
  return { s, bg: `rgba(${r},${g},${b},${s.opacity})` };
}

function monthGrid(year, month, products, today) {
  const days = daysInMonth(year, month);
  const firstWeekday = new Date(year, month, 1).getDay();
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  const isCurrentMonth = today.startsWith(monthStr);

  // Group products by exact drop day
  const dropsByDay = {};
  products.forEach(p => {
    if (!p.drop_date || p.drop_date.slice(0,7) !== monthStr) return;
    (dropsByDay[p.drop_date] ||= []).push(p);
  });

  // Group key dates by exact day (fixed-date ones) or by day-of-month (recurring "month" markers)
  const keyDatesByDay = {};
  KEY_DATES.forEach(k => {
    if (!k.month && k.date.slice(0,7) === monthStr) {
      (keyDatesByDay[k.date] ||= []).push(k);
    } else if (k.month && k.date.slice(5,7) === String(month+1).padStart(2,'0')) {
      const d = isoDate(year, month, parseInt(k.date.slice(8,10), 10) || 1);
      (keyDatesByDay[d] ||= []).push(k);
    }
  });

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const cellHtml = day => {
    if (day === null) return `<div class="dtc-cal-cell dtc-cal-cell-empty"></div>`;
    const dateStr = isoDate(year, month, day);
    const tint = seasonalTint(dateStr);
    const drops = dropsByDay[dateStr] || [];
    const keyDates = keyDatesByDay[dateStr] || [];
    const isToday = dateStr === today;
    return `<div class="dtc-cal-cell${isToday ? ' dtc-cal-cell-today' : ''}" style="${tint ? `background:${tint.bg}` : ''}">
      <div class="dtc-cal-daynum">${day}</div>
      ${keyDates.map(k => `<div class="dtc-cal-keydate" style="color:#${k.color}" title="${k.label}">${k.label}</div>`).join('')}
      ${drops.map(p => {
        const risk = calcDropRisk(p);
        const color = risk === 'overdue' ? 'var(--red)' : risk === 'at-risk' ? 'var(--accent)' : 'var(--green)';
        return `<div class="dtc-cal-drop" data-open-dtc="${p.id}" style="background:${color}" title="${p.name} — ${p.phase}${risk !== 'unknown' && risk !== 'ok' ? ' (' + risk + ')' : ''}">${p.name}</div>`;
      }).join('')}
    </div>`;
  };

  return `
    <div class="dtc-cal-month${isCurrentMonth ? ' dtc-cal-month-current' : ''}">
      <div class="dtc-cal-month-header">
        <span>${MONTH_NAMES[month]} ${year}</span>
        ${isCurrentMonth ? '<span class="dtc-cal-today-badge">TODAY</span>' : ''}
      </div>
      <div class="dtc-cal-weekdays">${WEEKDAY_NAMES.map(w => `<div>${w}</div>`).join('')}</div>
      <div class="dtc-cal-grid">${cells.map(cellHtml).join('')}</div>
    </div>`;
}

export function renderDtcCalendar(products) {
  const el = document.getElementById('dtcCalendarView');
  if (!el) return;

  const today = todayStr();
  const now = new Date();
  const startMonth = el._calStart ?? now.getMonth();
  const startYear  = el._calYear  ?? now.getFullYear();
  el._calStart = startMonth;
  el._calYear  = startYear;

  const months = Array.from({ length: 12 }, (_, i) => {
    const total = startYear * 12 + startMonth + i;
    return { year: Math.floor(total / 12), month: total % 12 };
  });

  const productsWithDrops = products.filter(p => p.drop_date);

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.06em">Legend:</span>
        <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)"><span style="width:10px;height:10px;border-radius:2px;background:var(--green);display:inline-block"></span>On track</span>
        <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)"><span style="width:10px;height:10px;border-radius:2px;background:var(--accent);display:inline-block"></span>At risk</span>
        <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)"><span style="width:10px;height:10px;border-radius:2px;background:var(--red);display:inline-block"></span>Overdue</span>
        <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)"><span style="width:10px;height:10px;border-radius:2px;background:rgba(91,156,246,.3);display:inline-block"></span>Seasonal window</span>
      </div>
      <div class="period-nav">
        <button class="btn btn-sm btn-ghost" id="dtcCalPrev">‹</button>
        <span class="period-label">${MONTH_NAMES[months[0].month]} ${months[0].year}</span>
        <button class="btn btn-sm btn-ghost" id="dtcCalNext">›</button>
        <button class="btn btn-sm btn-accent" id="dtcCalToday">Today</button>
      </div>
    </div>
    <div class="dtc-cal-months">
      ${months.map(({ year, month }) => monthGrid(year, month, productsWithDrops, today)).join('')}
    </div>`;

  document.getElementById('dtcCalPrev').addEventListener('click', () => {
    const total = el._calYear * 12 + el._calStart - 1;
    el._calYear = Math.floor(total / 12); el._calStart = ((total % 12) + 12) % 12;
    renderDtcCalendar(products);
  });
  document.getElementById('dtcCalNext').addEventListener('click', () => {
    const total = el._calYear * 12 + el._calStart + 1;
    el._calYear = Math.floor(total / 12); el._calStart = total % 12;
    renderDtcCalendar(products);
  });
  document.getElementById('dtcCalToday').addEventListener('click', () => {
    el._calStart = new Date().getMonth(); el._calYear = new Date().getFullYear();
    renderDtcCalendar(products);
  });
}
