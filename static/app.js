const state = {
  date: todayISO(),
  categories: [],
  grid: null,
  predictions: null,
  scoreData: null,
  chartData: null,
  calendarData: null,
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

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

function getCurrentSlot() {
  const now = new Date();
  return Math.floor((now.getHours() * 60 + now.getMinutes()) / 30);
}

function slotToTime(i) {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

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

  if (state.currentView === "charts") {
    setTimeout(renderCharts, 50);
  }
}

async function loadMeta() {
  const data = await fetchJSON("/meta");
  state.categories = data.categories;
}

async function loadDay(date) {
  state.date = date;
  const [grid, preds, score, charts, calendar, analytics] = await Promise.all([
    fetchJSON(`/days/${date}`),
    fetchJSON(`/predict/${date}`),
    fetchJSON(`/score/${date}`),
    fetchJSON(`/charts/${date}`),
    fetchJSON(`/calendar/${date}`),
    fetchJSON(`/analytics/${date}`) // <-- НОВЫЙ ЗАПРОС
  ]);
  state.grid = grid;
  state.predictions = preds;
  state.scoreData = score;
  state.chartData = charts;
  state.calendarData = calendar;
  state.analyticsData = analytics; // <-- СОХРАНЯЕМ
  
  renderHome();
}


function renderHome() {
  renderStats();
  renderTimeline();
  renderScore();
  if (state.currentView === "charts") renderCharts();
  if (state.currentView === "calendar") renderCalendar();
}

function renderStats() {
  // Функция оставлена для совместимости, визуально статистика убрана из UI
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
  const analytics = state.analyticsData;
  if (!data || !analytics) return;

  const style = getComputedStyle(document.documentElement);
  const textColor = style.getPropertyValue('--muted').trim();
  const gridColor = style.getPropertyValue('--border').trim();
  const pointColor = style.getPropertyValue('--bg').trim();

  // Хелпер для получения цвета из CSS-переменной
  const getCatColor = (cat, alpha = 1) => {
    const val = style.getPropertyValue(`--${cat}-rgb`).trim();
    return val ? `rgba(${val}, ${alpha})` : `rgba(0,0,0,${alpha})`;
  };

  // ==========================================
  // 1. Doughnut (Распределение категорий)
  // ==========================================
  const distLabels = Object.keys(data.distribution);
  const distValues = Object.values(data.distribution);
  const distBgColors = distLabels.map(c => getCatColor(c, 0.8));

  if (window.distChartInstance) window.distChartInstance.destroy();
  const ctxDist = document.getElementById('distChart').getContext('2d');
  window.distChartInstance = new Chart(ctxDist, {
    type: 'doughnut',
    data: { 
      labels: distLabels, 
      datasets: [{ data: distValues, backgroundColor: distBgColors, borderWidth: 0 }] 
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: false, 
      cutout: '70%', 
      plugins: { legend: { position: 'right', labels: { color: textColor, font: {size: 11} } } } 
    }
  });

  // ==========================================
  // 2. Line (История баланса)
  // ==========================================
  const histLabels = data.history.map(h => h.date);
  const histScores = data.history.map(h => h.score);

  if (window.historyChartInstance) window.historyChartInstance.destroy();
  const ctxHist = document.getElementById('historyChart').getContext('2d');
  window.historyChartInstance = new Chart(ctxHist, {
    type: 'line',
    data: { 
      labels: histLabels, 
      datasets: [{ 
        label: 'Day Balance', 
        data: histScores, 
        borderColor: getCatColor('exercise', 1), 
        backgroundColor: getCatColor('exercise', 0.2), 
        fill: true, 
        tension: 0.4, 
        pointBackgroundColor: pointColor, 
        pointBorderColor: getCatColor('exercise', 1), 
        pointBorderWidth: 2, 
        pointRadius: 4 
      }] 
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: false, 
      scales: { 
        y: { min: 0, max: 100, grid: { color: gridColor }, ticks: { color: textColor } }, 
        x: { grid: { display: false }, ticks: { color: textColor } } 
      }, 
      plugins: { legend: { display: false } } 
    }
  });

  // ==========================================
  // 3. Bar (Активность по часам)
  // ==========================================
  if (window.hourlyChartInstance) window.hourlyChartInstance.destroy();
  
  const hourKeys = Object.keys(analytics.hourly).sort((a, b) => parseInt(a) - parseInt(b));
  const hourLabels = hourKeys.map(h => `${h}:00`);
  
  const workByHour = hourKeys.map(h => (analytics.hourly[h] && analytics.hourly[h]["work"]) ? analytics.hourly[h]["work"] : 0);
  const restByHour = hourKeys.map(h => (analytics.hourly[h] && analytics.hourly[h]["rest"]) ? analytics.hourly[h]["rest"] : 0);

  const ctxHourly = document.getElementById('hourlyChart').getContext('2d');
  window.hourlyChartInstance = new Chart(ctxHourly, {
    type: 'bar',
    data: {
      labels: hourLabels,
      datasets: [
        { label: 'Work', data: workByHour, backgroundColor: getCatColor('work', 0.8) },
        { label: 'Rest', data: restByHour, backgroundColor: getCatColor('rest', 0.8) }
      ]
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: false, 
      scales: { 
        x: { stacked: true, ticks: { color: textColor } }, 
        y: { stacked: true, grid: { color: gridColor }, ticks: { color: textColor } } 
      } 
    }
  });

  // ==========================================
  // 4. Bar (Активность по дням недели)
  // ==========================================
  if (window.dowChartInstance) window.dowChartInstance.destroy();
  
  const dowLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const workByDow = dowLabels.map((_, i) => (analytics.dow[i] && analytics.dow[i]["work"]) ? analytics.dow[i]["work"] : 0);
  const restByDow = dowLabels.map((_, i) => (analytics.dow[i] && analytics.dow[i]["rest"]) ? analytics.dow[i]["rest"] : 0);

  const ctxDow = document.getElementById('dowChart').getContext('2d');
  window.dowChartInstance = new Chart(ctxDow, {
    type: 'bar',
    data: {
      labels: dowLabels,
      datasets: [
        { label: 'Work', data: workByDow, backgroundColor: getCatColor('work', 0.8) },
        { label: 'Rest', data: restByDow, backgroundColor: getCatColor('rest', 0.8) }
      ]
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: false, 
      scales: { 
        x: { stacked: true, ticks: { color: textColor } }, 
        y: { stacked: true, grid: { color: gridColor }, ticks: { color: textColor } } 
      } 
    }
  });
}

function renderCalendar() {
  if (!state.calendarData) return;

  const activityEl = document.getElementById("heatmap-activity");
  const scoreEl = document.getElementById("heatmap-score");
  activityEl.innerHTML = "";
  scoreEl.innerHTML = "";

  for (const day of state.calendarData) {
    const cellAct = document.createElement("div");
    cellAct.className = "heatmap-cell";
    if (day.filled > 0 && day.dominant) {
      const opacity = 0.3 + (Math.min(day.filled, 32) / 32) * 0.7;
      cellAct.style.background = `rgba(var(--${day.dominant}-rgb), ${opacity})`;
      cellAct.title = `${day.date}: ${day.dominant} (${day.filled} blocks)`;
    } else {
      cellAct.classList.add("empty");
      cellAct.title = `${day.date}: No data`;
    }
    
    cellAct.addEventListener("click", () => {
      document.getElementById("date-picker").value = day.date;
      window.hasAutoScrolled = false;
      loadDay(day.date);
      document.querySelector('[data-view="home"]').click();
    });
    activityEl.appendChild(cellAct);

    const cellScore = document.createElement("div");
    cellScore.className = "heatmap-cell";
    if (day.filled > 0) {
      const t = day.score / 100;
      const r = Math.round(239 + (16 - 239) * t);
      const g = Math.round(68 + (185 - 68) * t);
      const b = Math.round(68 + (129 - 68) * t);
      const opacity = 0.4 + t * 0.6;
      cellScore.style.background = `rgba(${r}, ${g}, ${b}, ${opacity})`;
      cellScore.title = `${day.date}: Score ${day.score}`;
    } else {
      cellScore.classList.add("empty");
      cellScore.title = `${day.date}: No data`;
    }

    cellScore.addEventListener("click", () => {
      document.getElementById("date-picker").value = day.date;
      window.hasAutoScrolled = false;
      loadDay(day.date);
      document.querySelector('[data-view="home"]').click();
    });
    scoreEl.appendChild(cellScore);
  }
}

function renderTimeline() {
  const timelineEl = document.getElementById("timeline");
  timelineEl.innerHTML = "";

  const todayStr = todayISO();
  const currentSlot = getCurrentSlot();

  for (let i = 16; i < 48; i++) {
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
  const MAX_DOM_INDEX = 31;

  if (!window.hasAutoScrolled) {
    let targetDomIdx = 0;
    const current = getCurrentSlot();
    if (state.date === todayISO() && current >= 16) {
      targetDomIdx = Math.min(current - 16, MAX_DOM_INDEX);
    }
    
    scrollEl.scrollTo({ left: targetDomIdx * step, behavior: 'auto' });
    window.hasAutoScrolled = true;
    updateActiveTime(targetDomIdx);
  }

  let scrollTimeout;
  scrollEl.onscroll = () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const centerIdx = Math.round(scrollEl.scrollLeft / step);
      const safeIdx = Math.max(0, Math.min(MAX_DOM_INDEX, centerIdx));
      updateActiveTime(safeIdx);
    }, 50);
  };

  document.querySelector(".timeline-wrapper").onwheel = (e) => {
    e.preventDefault();
    const direction = e.deltaY > 0 ? 1 : -1; 
    const currentIdx = Math.round(scrollEl.scrollLeft / step);
    let nextIdx = currentIdx + direction;
    nextIdx = Math.max(0, Math.min(MAX_DOM_INDEX, nextIdx));
    
    scrollEl.scrollTo({ left: nextIdx * step, behavior: 'smooth' });
  };
}

function updateActiveTime(domIndex) {
  state.activeSlotIndex = domIndex;
  const timeDisplay = document.getElementById("active-time");
  const realSlotIndex = domIndex + 16;
  
  timeDisplay.textContent = slotToTime(realSlotIndex);

  if (state.date === todayISO() && realSlotIndex === getCurrentSlot()) {
    timeDisplay.classList.add("is-now");
  } else {
    timeDisplay.classList.remove("is-now");
  }
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
    
    const domIdx = index - 16;
    const scrollEl = document.getElementById("timeline-scroll");
    scrollEl.scrollTo({ left: domIdx * (64 + 8), behavior: 'auto' });
    updateActiveTime(domIdx);
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
    
    const domIdx = index - 16;
    const scrollEl = document.getElementById("timeline-scroll");
    scrollEl.scrollTo({ left: domIdx * (64 + 8), behavior: 'auto' });
    updateActiveTime(domIdx);
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