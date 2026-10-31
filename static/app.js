const state = {
  date: todayISO(),
  categories: [],
  grid: null,
  predictions: null,
  scoreData: null,
  chartData: null,
  editing: null,
  activeSlotIndex: 0,
  currentView: "home",
  theme: "dark",
};

let distChartInstance = null;
let historyChartInstance = null;

const catColors = {
  work: 'rgba(59, 130, 246, 0.8)',
  learning: 'rgba(139, 92, 246, 0.8)',
  exercise: 'rgba(16, 185, 129, 0.8)',
  social: 'rgba(245, 158, 11, 0.8)',
  rest: 'rgba(107, 114, 128, 0.8)',
  chores: 'rgba(180, 83, 9, 0.8)'
};

// ... (функции todayISO, getCurrentSlot, slotToTime, escapeHtml, fetchJSON остаются без изменений)
function todayISO() { const d = new Date(); const tz = d.getTimezoneOffset() * 60000; return new Date(d - tz).toISOString().slice(0, 10); }
function getCurrentSlot() { const now = new Date(); return Math.floor((now.getHours() * 60 + now.getMinutes()) / 30); }
function slotToTime(i) { const h = String(Math.floor(i / 2)).padStart(2, "0"); const m = i % 2 === 0 ? "00" : "30"; return `${h}:${m}`; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

async function fetchJSON(url, options) {
  const separator = url.includes('?') ? '&' : '?';
  const noCacheUrl = `${url}${separator}_t=${Date.now()}`;
  const r = await fetch(noCacheUrl, { cache: 'no-store', ...options });
  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try { const body = await r.json(); if (body.detail) detail = body.detail; } catch (_) {}
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return r.status === 204 ? null : r.json();
}

// ====== НАВИГАЦИЯ И ТЕМА ======
function setupNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  const views = document.querySelectorAll(".view");

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const viewName = item.dataset.view;
      state.currentView = viewName;

      navItems.forEach(n => n.classList.remove("active"));
      item.classList.add("active");

      views.forEach(v => v.classList.remove("active"));
      document.getElementById(`view-${viewName}`).classList.add("active");

      // Если открыли графики, нужно перерисовать их (Chart.js глючит в скрытых элементах)
      if (viewName === "charts") {
        setTimeout(renderCharts, 50);
      } else if (viewName === "calendar") {
        renderCalendar();
      }
    });
  });
}

function setupTheme() {
  const savedTheme = localStorage.getItem("theme") || "dark";
  setTheme(savedTheme);

  document.querySelectorAll(".theme-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      setTheme(btn.dataset.theme);
    });
  });
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);

  document.querySelectorAll(".theme-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.theme === theme);
  });

  // Перерисовываем графики в новых цветах (опционально, Chart.js сам подхватит переменные CSS, если мы настроим)
  if (state.currentView === "charts") {
    setTimeout(renderCharts, 50);
  }
}

// ====== ЗАГРУЗКА ДАННЫХ ======
async function loadMeta() {
  const data = await fetchJSON("/meta");
  state.categories = data.categories;
}

async function loadDay(date) {
  state.date = date;
  const [grid, preds, score, charts] = await Promise.all([
    fetchJSON(`/days/${date}`),
    fetchJSON(`/predict/${date}`),
    fetchJSON(`/score/${date}`),
    fetchJSON(`/charts/${date}`)
  ]);
  state.grid = grid;
  state.predictions = preds;
  state.scoreData = score;
  state.chartData = charts;
  
  renderHome();
}

function renderHome() {
  renderStats();
  renderTimeline();
  renderScore();
  if (state.currentView === "charts") renderCharts();
  if (state.currentView === "calendar") renderCalendar();
}

// ... (renderStats, renderScore, renderCharts, renderTimeline, initScrollLogic, updateActiveTime, openModal, renderCategorySelect, saveBlock, deleteBlock, closeModal остаются без изменений)
function renderStats() {
  const filled = state.grid.slots.filter(s => s.block);
  const counts = {};
  for (const s of filled) counts[s.block.category] = (counts[s.block.category] || 0) + 1;
  const parts = Object.entries(counts).map(([c, n]) => `${c}: ${n}`).join(" · ");
  // Убрали шапку, stats можно вывести в консоль или добавить в какой-то элемент (пока пропустим визуализацию)
}

function renderScore() {
  const scoreEl = document.getElementById("score-value");
  const data = state.scoreData;
  if (!data || data.total_blocks === 0) { scoreEl.textContent = "—"; scoreEl.className = "score-circle"; return; }
  scoreEl.textContent = data.score;
  scoreEl.className = "score-circle";
  if (data.score >= 80) scoreEl.classList.add("good");
  else if (data.score >= 50) scoreEl.classList.add("mid");
  else scoreEl.classList.add("bad");
}

function renderCharts() {
  const data = state.chartData;
  if (!data) return;

  // Читаем цвета прямо из CSS, чтобы графики работали с любой темой
  const style = getComputedStyle(document.documentElement);
  const textColor = style.getPropertyValue('--muted').trim();
  const gridColor = style.getPropertyValue('--border').trim();
  const pointColor = style.getPropertyValue('--bg').trim();
  const accentColor = style.getPropertyValue('--exercise-rgb').trim(); // Зеленый из текущей темы

  const distLabels = Object.keys(data.distribution);
  const distValues = Object.values(data.distribution);
  
  // Для пончика используем цвета из категорий
  const distBgColors = distLabels.map(c => `rgba(var(--${c}-rgb), 0.8)`);

  if (distChartInstance) distChartInstance.destroy();
  const ctxDist = document.getElementById('distChart').getContext('2d');
  distChartInstance = new Chart(ctxDist, {
    type: 'doughnut',
    data: { labels: distLabels, datasets: [{ data: distValues, backgroundColor: distBgColors, borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'right', labels: { color: textColor, font: {size: 11} } } } }
  });

  const histLabels = data.history.map(h => h.date);
  const histScores = data.history.map(h => h.score);

  if (historyChartInstance) historyChartInstance.destroy();
  const ctxHist = document.getElementById('historyChart').getContext('2d');
  historyChartInstance = new Chart(ctxHist, {
    type: 'line',
    data: { labels: histLabels, datasets: [{ label: 'Day Balance', data: histScores, borderColor: `rgb(${accentColor})`, backgroundColor: `rgba(${accentColor}, 0.2)`, fill: true, tension: 0.4, pointBackgroundColor: pointColor, pointBorderColor: `rgb(${accentColor})`, pointBorderWidth: 2, pointRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100, grid: { color: gridColor }, ticks: { color: textColor } }, x: { grid: { display: false }, ticks: { color: textColor } } }, plugins: { legend: { display: false } } }
  });
}


function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";
  
  // Простой календарь на текущий месяц (только числа)
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // Пустые ячейки для смещения первого дня
  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1; // Пн-Вс
  
  for (let i = 0; i < offset; i++) {
    grid.appendChild(document.createElement("div"));
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const div = document.createElement("div");
    div.className = "calendar-day";
    div.textContent = d;
    // Клик по календарю переключает на логгер и ставит дату
    div.addEventListener("click", () => {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      document.getElementById("date-picker").value = dateStr;
      window.hasAutoScrolled = false;
      loadDay(dateStr);
      document.querySelector('[data-view="home"]').click();
    });
    grid.appendChild(div);
  }
}

function renderTimeline() {
  const timelineEl = document.getElementById("timeline");
  timelineEl.innerHTML = "";

  const todayStr = todayISO();
  const currentSlot = getCurrentSlot();

  for (let i = 0; i < 48; i++) {
    const slot = state.grid.slots[i];
    const block = slot.block;
    const prediction = state.predictions[i];

    const div = document.createElement("div");
    div.className = "slot";
    div.dataset.index = i;

    let isPast = state.date < todayStr || (state.date === todayStr && i < currentSlot);
    let isFuture = state.date > todayStr || (state.date === todayStr && i > currentSlot);
    let isNow = state.date === todayStr && i === currentSlot;

    if (block) {
      div.classList.add("filled", `cat-${block.category}`);
      div.innerHTML = `<span class="cat-letter">${block.category.charAt(0).toUpperCase()}</span>`;
      if (isPast) div.addEventListener("click", () => openModal(slot, i));
    } else if ((isFuture || isNow) && prediction) {
      // Показываем предсказание и для будущего, и для текущего момента
      div.classList.add("predicted", `cat-${prediction.category}`);
      if (isNow) div.classList.add("now-predicted");
      div.innerHTML = `<span class="cat-letter">${prediction.category.charAt(0).toUpperCase()}</span>`;
    } else if (isPast) {
      div.classList.add("empty");
      div.addEventListener("click", () => openModal(slot, i));
    } else {
      div.classList.add("empty", "now-slot");
    }

    timelineEl.appendChild(div);
  }

  setTimeout(initScrollLogic, 50);
}

function initScrollLogic() {
  const scrollEl = document.getElementById("timeline-scroll");
  const step = 64 + 8; 

  if (!window.hasAutoScrolled) {
    const targetIdx = state.date === todayISO() ? getCurrentSlot() : 0;
    scrollEl.scrollTo({ left: targetIdx * step, behavior: 'auto' });
    window.hasAutoScrolled = true;
    updateActiveTime(targetIdx);
  }

  let scrollTimeout;
  scrollEl.onscroll = () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const centerIdx = Math.round(scrollEl.scrollLeft / step);
      updateActiveTime(Math.max(0, Math.min(47, centerIdx)));
    }, 50);
  };

  document.querySelector(".timeline-wrapper").onwheel = (e) => {
    e.preventDefault();
    const direction = e.deltaY > 0 ? 1 : -1; 
    const currentIdx = Math.round(scrollEl.scrollLeft / step);
    let nextIdx = currentIdx + direction;
    nextIdx = Math.max(0, Math.min(47, nextIdx));
    scrollEl.scrollTo({ left: nextIdx * step, behavior: 'smooth' });
  };
}

function updateActiveTime(index) {
  state.activeSlotIndex = index;
  const timeDisplay = document.getElementById("active-time");
  timeDisplay.textContent = slotToTime(index);
  if (state.date === todayISO() && index === getCurrentSlot()) timeDisplay.classList.add("is-now");
  else timeDisplay.classList.remove("is-now");
}

function openModal(slot, index) {
  state.editing = { slot, block: slot.block, index };
  const title = document.getElementById("modal-title");
  const deleteBtn = document.getElementById("delete-btn");
  
  if (slot.block) { title.textContent = `Edit ${slotToTime(index)}`; deleteBtn.hidden = false; }
  else { title.textContent = `Log ${slotToTime(index)}`; deleteBtn.hidden = true; }

  renderCategorySelect();
  document.getElementById("modal").hidden = false;
}

function renderCategorySelect() {
  const container = document.getElementById("category-select");
  container.innerHTML = "";
  for (const cat of state.categories) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `category-btn cat-${cat}`;
    btn.textContent = cat;
    btn.addEventListener("click", () => saveBlock(cat));
    container.appendChild(btn);
  }
}

async function saveBlock(category) {
  const { block, index } = state.editing;
  try {
    if (block) {
      await fetchJSON(`/blocks/${block.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category }) });
    } else {
      await fetchJSON("/blocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ block_date: state.date, slot_index: index, category }) });
    }
    closeModal();
    window.hasAutoScrolled = true; 
    await loadDay(state.date);
    document.getElementById("timeline-scroll").scrollTo({ left: index * (64 + 8), behavior: 'auto' });
    updateActiveTime(index);
  } catch (e) { alert(`Error: ${e.message}`); }
}

async function deleteBlock() {
  if (!state.editing.block) return;
  if (!confirm("Delete this block?")) return;
  try {
    await fetchJSON(`/blocks/${state.editing.block.id}`, { method: "DELETE" });
    const index = state.editing.index;
    closeModal();
    window.hasAutoScrolled = true;
    await loadDay(state.date);
    document.getElementById("timeline-scroll").scrollTo({ left: index * (64 + 8), behavior: 'auto' });
    updateActiveTime(index);
  } catch (e) { alert(`Error: ${e.message}`); }
}

function closeModal() {
  document.getElementById("modal").hidden = true;
  state.editing = null;
}

function init() {
  setupNavigation();
  setupTheme();

  document.getElementById("date-picker").value = state.date;
  window.hasAutoScrolled = false; 

  document.getElementById("date-picker").addEventListener("change", e => {
    window.hasAutoScrolled = false; 
    loadDay(e.target.value).catch(err => alert(err.message));
  });

  document.getElementById("today-btn").addEventListener("click", () => {
    const t = todayISO();
    document.getElementById("date-picker").value = t;
    window.hasAutoScrolled = false;
    loadDay(t).catch(err => alert(err.message));
  });

  document.getElementById("delete-btn").addEventListener("click", deleteBlock);
  document.getElementById("modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });

  setInterval(() => {
      if(state.date === todayISO() && state.currentView === "home") updateActiveTime(state.activeSlotIndex);
  }, 60000);

  loadMeta().then(() => loadDay(state.date)).catch(err => {
      document.getElementById("timeline").innerHTML = `<p style="color:#ef4444;padding:16px">Failed to load: ${escapeHtml(err.message)}</p>`;
  });
}

document.addEventListener("DOMContentLoaded", init);