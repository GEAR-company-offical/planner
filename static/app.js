const state = {
  date: todayISO(),
  categories: [],
  grid: null,
  predictions: null,
  editing: null,
  activeSlotIndex: 0,
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
  const r = await fetch(url, options);
  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try { const body = await r.json(); if (body.detail) detail = body.detail; } catch (_) {}
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return r.status === 204 ? null : r.json();
}

async function loadMeta() {
  const data = await fetchJSON("/meta");
  state.categories = data.categories;
}

async function loadDay(date) {
  state.date = date;
  const [grid, preds] = await Promise.all([
    fetchJSON(`/days/${date}`),
    fetchJSON(`/predict/${date}`)
  ]);
  state.grid = grid;
  state.predictions = preds;
  // Убрали сброс window.hasAutoScrolled отсюда
  render();
}

function render() {
  renderStats();
  renderTimeline();
}

function renderStats() {
  const filled = state.grid.slots.filter(s => s.block);
  const counts = {};
  for (const s of filled) {
    counts[s.block.category] = (counts[s.block.category] || 0) + 1;
  }
  const parts = Object.entries(counts).map(([c, n]) => `${c}: ${n}`).join(" · ");
  document.getElementById("stats").innerHTML = `
    <span>logged: <b>${filled.length}</b>/48</span>
    ${parts ? `<span>${escapeHtml(parts)}</span>` : ""}
  `;
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

    if (block) {
      div.classList.add("filled", `cat-${block.category}`);
      div.innerHTML = `<span class="cat-letter">${block.category.charAt(0).toUpperCase()}</span>`;
      if (isPast) div.addEventListener("click", () => openModal(slot, i));
    } else if (isFuture && prediction) {
      div.classList.add("predicted", `cat-${prediction.category}`);
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
  const step = 64 + 8; // 72px

  // Автоскролл только при ПЕРВОЙ загрузке или смене даты
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
      const safeIdx = Math.max(0, Math.min(47, centerIdx));
      updateActiveTime(safeIdx);
    }, 50);
  };

  // УСКОРЯЕМ ПРОКРУТКУ (по 2 блока за тик)
  document.querySelector(".timeline-wrapper").onwheel = (e) => {
    e.preventDefault();
    const direction = e.deltaY > 0 ? 2 : -2; // Было 1 и -1
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

  if (state.date === todayISO() && index === getCurrentSlot()) {
    timeDisplay.classList.add("is-now");
  } else {
    timeDisplay.classList.remove("is-now");
  }
}

function openModal(slot, index) {
  state.editing = { slot, block: slot.block, index };
  
  const title = document.getElementById("modal-title");
  const deleteBtn = document.getElementById("delete-btn");
  
  if (slot.block) {
    title.textContent = `Edit ${slotToTime(index)}`;
    deleteBtn.hidden = false;
  } else {
    title.textContent = `Log ${slotToTime(index)}`;
    deleteBtn.hidden = true;
  }

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
      await fetchJSON(`/blocks/${block.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
    } else {
      await fetchJSON("/blocks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ block_date: state.date, slot_index: index, category }),
      });
    }
    closeModal();
    
    // БЛОКИРУЕМ АВТОСКРОЛЛ ПРИ ОБНОВЛЕНИИ
    window.hasAutoScrolled = true; 
    await loadDay(state.date);
    
    // Возвращаем скролл на место
    const scrollEl = document.getElementById("timeline-scroll");
    scrollEl.scrollTo({ left: index * (64 + 8), behavior: 'auto' });
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
    
    // БЛОКИРУЕМ АВТОСКРОЛЛ ПРИ ОБНОВЛЕНИИ
    window.hasAutoScrolled = true;
    await loadDay(state.date);
    
    // Возвращаем скролл на место
    const scrollEl = document.getElementById("timeline-scroll");
    scrollEl.scrollTo({ left: index * (64 + 8), behavior: 'auto' });
    updateActiveTime(index);

  } catch (e) { alert(`Error: ${e.message}`); }
}

function closeModal() {
  document.getElementById("modal").hidden = true;
  state.editing = null;
}

function init() {
  document.getElementById("date-picker").value = state.date;
  window.hasAutoScrolled = false; // При старте страницы скроллим к NOW

  document.getElementById("date-picker").addEventListener("change", e => {
    window.hasAutoScrolled = false; // При смене даты скроллим к началу/NOW
    loadDay(e.target.value).catch(err => alert(err.message));
  });

  document.getElementById("today-btn").addEventListener("click", () => {
    const t = todayISO();
    document.getElementById("date-picker").value = t;
    window.hasAutoScrolled = false; // При клике на Today скроллим к NOW
    loadDay(t).catch(err => alert(err.message));
  });

  document.getElementById("delete-btn").addEventListener("click", deleteBlock);
  
  // Выход по клику на пустое пространство (фон)
  document.getElementById("modal").addEventListener("click", e => {
    if (e.target.id === "modal") closeModal();
  });

  setInterval(() => {
      if(state.date === todayISO()) updateActiveTime(state.activeSlotIndex);
  }, 60000);

  loadMeta().then(() => loadDay(state.date)).catch(err => {
      document.getElementById("timeline").innerHTML =
        `<p style="color:#ef4444;padding:16px">Failed to load: ${escapeHtml(err.message)}</p>`;
  });
}

document.addEventListener("DOMContentLoaded", init);