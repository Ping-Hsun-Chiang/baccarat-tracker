// ── State ─────────────────────────────────────────────────────────────────────

let records = [];       // local cache
let chart   = null;
let pendingAction = null;
let chartMonth    = null;
let sqlLogVisible = true;

// ── Init (called by auth.js after login) ──────────────────────────────────────

async function initApp() {
  const today = localDateStr(new Date());
  document.getElementById('recordDate').value = today;
  chartMonth = today.slice(0, 7);

  await loadRecords();
  document.getElementById('loadingOverlay').style.display = 'none';
  render();
}

// ── Data: load ────────────────────────────────────────────────────────────────

async function loadRecords() {
  const userId = (await supa.auth.getUser()).data.user.id;

  addSQLLog(
    `SELECT id, date, type, amount, note FROM records\n` +
    `WHERE user_id = '${short(userId)}'\n` +
    `ORDER BY date DESC, id DESC`
  );

  const { data, error } = await supa
    .from('records')
    .select('id, date, type, amount, note')
    .order('date', { ascending: false })
    .order('id',   { ascending: false });

  if (!error) records = data ?? [];
}

// ── Data: add ─────────────────────────────────────────────────────────────────

async function addRecord(type) {
  const amountId = type === 'win' ? 'winAmount' : 'lossAmount';
  const date   = document.getElementById('recordDate').value;
  const amount = parseFloat(document.getElementById(amountId).value);
  const note   = document.getElementById('recordNote').value.trim();

  if (!date)                        return alert('請選擇日期');
  if (isNaN(amount) || amount <= 0) return alert('請輸入有效金額');

  const userId = (await supa.auth.getUser()).data.user.id;

  addSQLLog(
    `INSERT INTO records (user_id, date, type, amount, note)\n` +
    `VALUES ('${short(userId)}', '${date}', '${type}', ${amount}, '${note}')\n` +
    `RETURNING *`
  );

  const { data, error } = await supa
    .from('records')
    .insert({ user_id: userId, date, type, amount, note })
    .select('id, date, type, amount, note')
    .single();

  if (error) { alert('新增失敗，請稍後再試'); return; }

  records.unshift(data);
  records.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  document.getElementById(amountId).value = '';
  render();
}

// ── Data: delete ──────────────────────────────────────────────────────────────

function deleteRecord(id) {
  openModal('確定要刪除這筆記錄嗎？', async () => {
    const userId = (await supa.auth.getUser()).data.user.id;

    addSQLLog(
      `DELETE FROM records\n` +
      `WHERE id = ${id} AND user_id = '${short(userId)}'`
    );

    await supa.from('records').delete().eq('id', id);
    records = records.filter(r => r.id !== id);
    render();
  });
}

// ── Data: clear all ───────────────────────────────────────────────────────────

function confirmClearAll() {
  if (records.length === 0) return;
  openModal('確定要清除全部記錄嗎？此操作無法復原！', async () => {
    const userId = (await supa.auth.getUser()).data.user.id;

    addSQLLog(
      `DELETE FROM records\n` +
      `WHERE user_id = '${short(userId)}'`
    );

    await supa.from('records').delete().eq('user_id', userId);
    records = [];
    render();
  });
}

// ── Month nav ─────────────────────────────────────────────────────────────────

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

function calcNet(recs) {
  return recs.reduce((s, r) => s + (r.type === 'win' ? r.amount : -r.amount), 0);
}

function renderSummary() {
  const todayStr  = localDateStr(new Date());
  const thisMonth = todayStr.slice(0, 7);
  const thisYear  = todayStr.slice(0, 4);

  setCard('totalNet', calcNet(records));
  setCard('monthNet', calcNet(records.filter(r => r.date.startsWith(thisMonth))));
  setCard('yearNet',  calcNet(records.filter(r => r.date.startsWith(thisYear))));
}

function setCard(id, net) {
  const el = document.getElementById(id);
  el.textContent = formatMoney(net, true);

  const len = el.textContent.length;
  el.dataset.len = len <= 6 ? 'short' : len <= 8 ? 'medium' : len <= 11 ? 'long' : len <= 13 ? 'xl' : 'xxl';

  const card = el.closest('.card');
  card.classList.remove('positive', 'negative');
  if (net > 0) card.classList.add('positive');
  else if (net < 0) card.classList.add('negative');
}

function renderChart() {
  const filtered = chartMonth
    ? records.filter(r => r.date.startsWith(chartMonth))
    : records;

  const daily = groupByDate([...filtered].reverse());
  const dates = Object.keys(daily).sort();

  let cumulative = 0;
  const data = dates.map(d => {
    cumulative += daily[d].win - daily[d].loss;
    return cumulative;
  });

  const ctx = document.getElementById('profitChart').getContext('2d');
  if (chart) chart.destroy();

  const lastVal   = data[data.length - 1] ?? 0;
  const lineColor = lastVal >= 0 ? '#22c55e' : '#ef4444';
  const gradient  = ctx.createLinearGradient(0, 0, 0, 230);
  gradient.addColorStop(0, lastVal >= 0 ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        data,
        borderColor: lineColor,
        borderWidth: 2,
        backgroundColor: gradient,
        pointBackgroundColor: data.map(v => v >= 0 ? '#22c55e' : '#ef4444'),
        pointBorderColor:     data.map(v => v >= 0 ? '#22c55e' : '#ef4444'),
        pointRadius:      data.length <= 31 ? 4 : 2,
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
          grid:  { color: 'rgba(255,255,255,0.04)' },
          border:{ color: 'transparent' },
        },
        y: {
          ticks: {
            color: '#475569',
            font:  { size: 11, family: 'Inter' },
            callback: v => formatMoney(v, false),
          },
          grid:  { color: 'rgba(255,255,255,0.04)' },
          border:{ color: 'transparent' },
        },
      },
    },
  });
}

function renderDailyTable() {
  const daily = groupByDate([...records].reverse());
  const dates = Object.keys(daily).sort().reverse();
  const tbody = document.getElementById('dailyTableBody');
  tbody.innerHTML = '';

  if (dates.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">尚無記錄</td></tr>';
    return;
  }

  dates.forEach(date => {
    const { win, loss } = daily[date];
    const net = win - loss;
    const tr  = document.createElement('tr');
    tr.innerHTML = `
      <td>${date}</td>
      <td class="amount-win">${win  > 0 ? formatMoney(win, false)  : '-'}</td>
      <td class="amount-loss">${loss > 0 ? formatMoney(loss, false) : '-'}</td>
      <td class="${net >= 0 ? 'amount-positive' : 'amount-negative'}">${formatMoney(net, true)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderRecordsTable() {
  const tbody = document.getElementById('recordsTableBody');
  tbody.innerHTML = '';

  if (records.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">尚無記錄，請從上方新增</td></tr>';
    return;
  }

  records.forEach(r => {
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

function addSQLLog(sql) {
  const container = document.getElementById('sqlLog');
  const empty = container.querySelector('.sql-log-empty');
  if (empty) empty.remove();

  const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
  const item = document.createElement('div');
  item.className = 'sql-log-item';
  item.innerHTML = `
    <span class="sql-time">${time}</span>
    <span class="sql-stmt">${highlightSQL(escapeHtml(sql))}</span>
  `;
  container.insertBefore(item, container.firstChild);
  while (container.children.length > 30) container.removeChild(container.lastChild);
}

function highlightSQL(sql) {
  return sql.replace(
    /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|INTO|VALUES|CREATE|TABLE|AND|OR|ORDER BY|GROUP BY|RETURNING|NOT|IN|CHECK|DEFAULT|REFERENCES|ON DELETE CASCADE|UNIQUE|PRIMARY KEY|NUMERIC|TEXT|UUID|BIGSERIAL|TIMESTAMPTZ|ENABLE ROW LEVEL SECURITY|POLICY|FOR|USING|WITH CHECK)\b/g,
    '<span class="sql-kw">$1</span>'
  );
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function toggleSQLLog() {
  const wrap = document.getElementById('sqlLogWrap');
  sqlLogVisible = !sqlLogVisible;
  wrap.style.display = sqlLogVisible ? '' : 'none';
  document.getElementById('sqlToggleText').textContent = sqlLogVisible ? '收合' : '展開';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByDate(recs) {
  const map = {};
  recs.forEach(r => {
    if (!map[r.date]) map[r.date] = { win: 0, loss: 0 };
    map[r.date][r.type === 'win' ? 'win' : 'loss'] += Number(r.amount);
  });
  return map;
}

function localDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function formatMoney(n, signed) {
  const abs = '$' + Math.abs(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (!signed) return abs;
  if (n > 0) return '+' + abs;
  if (n < 0) return '-' + abs;
  return abs;
}

function short(uuid) {
  return uuid ? uuid.slice(0, 8) + '...' : '';
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

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const id = document.activeElement?.id;
  if (id === 'winAmount')  addRecord('win');
  if (id === 'lossAmount') addRecord('loss');
});

document.getElementById('recordDate').addEventListener('click', function () {
  try { this.showPicker(); } catch (_) {}
});
