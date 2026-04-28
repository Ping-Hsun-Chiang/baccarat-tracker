// ── SQLite (sql.js via WebAssembly) ──────────────────────────────────────────

const DB_KEY = 'baccarat_sqlite';
const LEGACY_KEY = 'baccarat_records';

let db = null;
let chart = null;
let pendingAction = null;
let chartMonth = null;
let sqlLogVisible = true;

// ── DB init ───────────────────────────────────────────────────────────────────

async function initDB() {
  const SQL = await initSqlJs({
    locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}`,
  });

  const saved = localStorage.getItem(DB_KEY);
  if (saved) {
    const buf = base64ToUint8(saved);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  execSQL(`
    CREATE TABLE IF NOT EXISTS records (
      id      INTEGER  PRIMARY KEY AUTOINCREMENT,
      date    TEXT     NOT NULL,
      type    TEXT     NOT NULL  CHECK(type IN ('win','loss')),
      amount  REAL     NOT NULL  CHECK(amount > 0),
      note    TEXT     NOT NULL  DEFAULT ''
    )
  `);

  migrateLegacy();
  persistDB();
}

function persistDB() {
  const buf = db.export();
  localStorage.setItem(DB_KEY, uint8ToBase64(buf));
}

// Migrate old JSON-in-localStorage format (one-time)
function migrateLegacy() {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return;
  try {
    const rows = JSON.parse(raw);
    rows.forEach(r => {
      execSQL(
        `INSERT OR IGNORE INTO records (id, date, type, amount, note) VALUES (?, ?, ?, ?, ?)`,
        [r.id, r.date, r.type, r.amount, r.note || ''],
        false
      );
    });
    localStorage.removeItem(LEGACY_KEY);
    persistDB();
  } catch (_) {}
}

// ── SQL helpers ───────────────────────────────────────────────────────────────

function execSQL(sql, params = [], log = true) {
  db.run(sql, params);
  if (log) addSQLLog(sql, params);
}

function querySQL(sql, params = [], log = true) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  if (log) addSQLLog(sql, params);
  return rows;
}

// ── App init ──────────────────────────────────────────────────────────────────

async function init() {
  await initDB();

  const today = localDateStr(new Date());
  document.getElementById('recordDate').value = today;
  chartMonth = today.slice(0, 7);

  document.getElementById('loadingOverlay').style.display = 'none';

  render();
}

// ── Add / Delete ──────────────────────────────────────────────────────────────

function addRecord(type) {
  const amountId = type === 'win' ? 'winAmount' : 'lossAmount';
  const date   = document.getElementById('recordDate').value;
  const amount = parseFloat(document.getElementById(amountId).value);
  const note   = document.getElementById('recordNote').value.trim();

  if (!date) return alert('請選擇日期');
  if (isNaN(amount) || amount <= 0) return alert('請輸入有效金額');

  execSQL(
    `INSERT INTO records (date, type, amount, note) VALUES (?, ?, ?, ?)`,
    [date, type, amount, note]
  );
  persistDB();

  document.getElementById(amountId).value = '';
  render();
}

function deleteRecord(id) {
  openModal('確定要刪除這筆記錄嗎？', () => {
    execSQL(`DELETE FROM records WHERE id = ?`, [id]);
    persistDB();
    render();
  });
}

function confirmClearAll() {
  const count = querySQL(`SELECT COUNT(*) AS n FROM records`, [], false)[0].n;
  if (count === 0) return;
  openModal('確定要清除全部記錄嗎？此操作無法復原！', () => {
    execSQL(`DELETE FROM records`);
    persistDB();
    render();
  });
}

// ── Month navigation ──────────────────────────────────────────────────────────

function shiftMonth(delta) {
  const base = chartMonth || localDateStr(new Date()).slice(0, 7);
  const [y, m] = base.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  chartMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  updateChartMonthLabel();
  renderChart();
}

function viewAllMonths() {
  chartMonth = null;
  updateChartMonthLabel();
  renderChart();
}

function updateChartMonthLabel() {
  const el  = document.getElementById('chartMonthLabel');
  const btn = document.querySelector('.btn-all-months');
  if (!chartMonth) {
    el.textContent = '全部';
    btn.classList.add('active');
  } else {
    const [y, m] = chartMonth.split('-');
    el.textContent = `${y}年${parseInt(m)}月`;
    btn.classList.remove('active');
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  renderSummary();
  updateChartMonthLabel();
  renderChart();
  renderDailyTable();
  renderRecordsTable();
}

function renderSummary() {
  const todayStr  = localDateStr(new Date());
  const thisMonth = todayStr.slice(0, 7);
  const thisYear  = todayStr.slice(0, 4);

  const totalNet = calcNetSQL(`SELECT type, amount FROM records`);
  const monthNet = calcNetSQL(
    `SELECT type, amount FROM records WHERE date LIKE ?`,
    [`${thisMonth}%`]
  );
  const yearNet = calcNetSQL(
    `SELECT type, amount FROM records WHERE date LIKE ?`,
    [`${thisYear}%`]
  );

  setCard('totalNet', totalNet);
  setCard('monthNet', monthNet);
  setCard('yearNet', yearNet);
}

function calcNetSQL(sql, params = []) {
  const rows = querySQL(sql, params);
  return rows.reduce((s, r) => s + (r.type === 'win' ? r.amount : -r.amount), 0);
}

function setCard(id, net) {
  const el = document.getElementById(id);
  el.textContent = formatMoney(net, true);

  // 依顯示字串長度分級，支援最多 7 位數（含符號與千分位）
  // short  ≤6:  "+$999"
  // medium 7-8: "+$5,092" / "+$12,345"
  // long   9-11: "+$123,456" / "+$1,234,567"
  // xl     12-13: "-$1,234,567" / "+$12,345,678"
  // xxl    14+:  "-$12,345,678"
  const len = el.textContent.length;
  let lenClass;
  if      (len <= 6)  lenClass = 'short';
  else if (len <= 8)  lenClass = 'medium';
  else if (len <= 11) lenClass = 'long';
  else if (len <= 13) lenClass = 'xl';
  else                lenClass = 'xxl';
  el.dataset.len = lenClass;

  const card = el.closest('.card');
  card.classList.remove('positive', 'negative');
  if (net > 0) card.classList.add('positive');
  else if (net < 0) card.classList.add('negative');
}

function renderChart() {
  const sql = chartMonth
    ? `SELECT date,
              SUM(CASE WHEN type='win'  THEN amount ELSE 0 END) AS win,
              SUM(CASE WHEN type='loss' THEN amount ELSE 0 END) AS loss
       FROM records
       WHERE date LIKE ?
       GROUP BY date
       ORDER BY date`
    : `SELECT date,
              SUM(CASE WHEN type='win'  THEN amount ELSE 0 END) AS win,
              SUM(CASE WHEN type='loss' THEN amount ELSE 0 END) AS loss
       FROM records
       GROUP BY date
       ORDER BY date`;

  const rows = querySQL(sql, chartMonth ? [`${chartMonth}%`] : []);

  let cumulative = 0;
  const labels = rows.map(r => r.date);
  const data   = rows.map(r => {
    cumulative += r.win - r.loss;
    return cumulative;
  });

  const ctx = document.getElementById('profitChart').getContext('2d');
  if (chart) chart.destroy();

  const lastVal   = data[data.length - 1] ?? 0;
  const lineColor = lastVal >= 0 ? '#22c55e' : '#ef4444';

  const gradient = ctx.createLinearGradient(0, 0, 0, 230);
  gradient.addColorStop(0, lastVal >= 0 ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '累計損益',
        data,
        borderColor: lineColor,
        borderWidth: 2,
        backgroundColor: gradient,
        pointBackgroundColor: data.map(v => v >= 0 ? '#22c55e' : '#ef4444'),
        pointBorderColor:     data.map(v => v >= 0 ? '#22c55e' : '#ef4444'),
        pointRadius: data.length <= 31 ? 4 : 2,
        pointHoverRadius: 6,
        tension: 0.35,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#16162a',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#94a3b8',
          bodyColor: '#f1f5f9',
          callbacks: { label: c => ' ' + formatMoney(c.raw, true) },
        },
      },
      scales: {
        x: {
          ticks: { color: '#475569', font: { size: 11, family: 'Inter' } },
          grid: { color: 'rgba(255,255,255,0.04)' },
          border: { color: 'transparent' },
        },
        y: {
          ticks: {
            color: '#475569',
            font: { size: 11, family: 'Inter' },
            callback: v => formatMoney(v, false),
          },
          grid: { color: 'rgba(255,255,255,0.04)' },
          border: { color: 'transparent' },
        },
      },
    },
  });
}

function renderDailyTable() {
  const rows = querySQL(
    `SELECT date,
            SUM(CASE WHEN type='win'  THEN amount ELSE 0 END) AS win,
            SUM(CASE WHEN type='loss' THEN amount ELSE 0 END) AS loss
     FROM records
     GROUP BY date
     ORDER BY date DESC`
  );

  const tbody = document.getElementById('dailyTableBody');
  tbody.innerHTML = '';

  if (rows.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">尚無記錄</td></tr>';
    return;
  }

  rows.forEach(({ date, win, loss }) => {
    const net = win - loss;
    const tr  = document.createElement('tr');
    tr.innerHTML = `
      <td>${date}</td>
      <td class="amount-win">${win > 0 ? formatMoney(win, false) : '-'}</td>
      <td class="amount-loss">${loss > 0 ? formatMoney(loss, false) : '-'}</td>
      <td class="${net >= 0 ? 'amount-positive' : 'amount-negative'}">${formatMoney(net, true)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderRecordsTable() {
  const rows  = querySQL(`SELECT * FROM records ORDER BY date DESC, id DESC`);
  const tbody = document.getElementById('recordsTableBody');
  tbody.innerHTML = '';

  if (rows.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">尚無記錄，請從上方新增</td></tr>';
    return;
  }

  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.date}</td>
      <td><span class="badge badge-${r.type}">${r.type === 'win' ? '贏' : '輸'}</span></td>
      <td class="${r.type === 'win' ? 'amount-win' : 'amount-loss'}">${formatMoney(r.amount, false)}</td>
      <td class="note-cell">${r.note || '-'}</td>
      <td><button class="btn-delete" onclick="deleteRecord(${r.id})" title="刪除">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// ── SQL Log panel ─────────────────────────────────────────────────────────────

function addSQLLog(sql, params) {
  const container = document.getElementById('sqlLog');
  const empty = container.querySelector('.sql-log-empty');
  if (empty) empty.remove();

  const clean = sql.trim().replace(/\s+/g, ' ');
  const time  = new Date().toLocaleTimeString('zh-TW', { hour12: false });

  const item = document.createElement('div');
  item.className = 'sql-log-item';

  const paramStr = params.length
    ? `<span class="sql-params">— [${params.map(p => JSON.stringify(p)).join(', ')}]</span>`
    : '';

  item.innerHTML = `
    <span class="sql-time">${time}</span>
    <span class="sql-stmt">${highlightSQL(clean)}</span>
    ${paramStr}
  `;

  container.insertBefore(item, container.firstChild);

  // Keep at most 30 entries
  while (container.children.length > 30) container.removeChild(container.lastChild);
}

function highlightSQL(sql) {
  const kw = /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|INTO|VALUES|CREATE|TABLE|IF NOT EXISTS|PRIMARY KEY|AUTOINCREMENT|ORDER BY|GROUP BY|LIKE|SUM|CASE|WHEN|THEN|ELSE|END|AND|OR|NOT|IN|CHECK|DEFAULT|TEXT|REAL|INTEGER)\b/g;
  return sql.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(kw, '<span class="sql-kw">$1</span>');
}

function toggleSQLLog() {
  const wrap = document.getElementById('sqlLogWrap');
  sqlLogVisible = !sqlLogVisible;
  wrap.style.display = sqlLogVisible ? '' : 'none';
  document.getElementById('sqlToggleText').textContent = sqlLogVisible ? '收合' : '展開';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatMoney(n, signed) {
  const abs = '$' + Math.abs(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (!signed) return abs;
  if (n > 0) return '+' + abs;
  if (n < 0) return '-' + abs;
  return abs;
}

function uint8ToBase64(buf) {
  let binary = '';
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

function base64ToUint8(b64) {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf;
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function openModal(message, onConfirm) {
  document.getElementById('modalMessage').textContent = message;
  document.getElementById('modalOverlay').classList.add('active');
  pendingAction = onConfirm;
  document.getElementById('modalConfirm').onclick = () => {
    if (pendingAction) pendingAction();
    closeModal();
  };
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  pendingAction = null;
}

document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

// Enter shortcuts
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const id = document.activeElement?.id;
  if (id === 'winAmount')  addRecord('win');
  if (id === 'lossAmount') addRecord('loss');
});

// Date picker anywhere
document.getElementById('recordDate').addEventListener('click', function () {
  try { this.showPicker(); } catch (_) {}
});

// ── Start ─────────────────────────────────────────────────────────────────────
init();
