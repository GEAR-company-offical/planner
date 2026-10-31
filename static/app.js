const state = {
  date: todayISO(),
  categories: [],
  grid: null,
  editing: null,
};

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
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
    throw new Error(detail);
  }
  return r.status === 204 ? null : r.json();
}

async function loadMeta() {
  const data = await fetchJSON("/meta");
  state.categories = data.categories;
}

async function loadDay(date) {
  state.date = date;
  state.grid = await fetchJSON(`/days/${date}`);
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
  const el = document.getElementById("timeline");
  el.innerHTML = "";

  for (const slot of state.grid.slots) {
    const div = document.createElement("div");
    div.className = "slot";
    const block = slot.block;
    const time = slotToTime(slot.slot_index);

    if (block) {
      div.classList.add("filled", `cat-${block.category}`);
      const letter = block.category.charAt(0).toUpperCase();
      div.innerHTML = `<span class="cat-letter">${letter}</span>`;
      div.title = `${time} - ${block.category}`;
    } else {
      div.classList.add("empty");
    }

    div.addEventListener("click", () => openModal(slot));
    el.appendChild(div);
  }
  updateNowLine();
}

function updateNowLine() {
  const timeline = document.getElementById("timeline");
  const existing = document.getElementById("now-line");
  if (existing) existing.remove();

  if (state.date !== todayISO()) return;

  const now = new Date();
  const currentSlotFloat = (now.getHours() * 60 + now.getMinutes()) / 30;
  const leftPos = currentSlotFloat * (64 + 8);

  const line = document.createElement("div");
  line.id = "now-line";
  line.className = "now-line";
  line.style.left = `${leftPos}px`;
  line.innerHTML = `<span class="now-label">NOW</span>`;
  timeline.appendChild(line);

  if (!window.hasAutoScrolled) {
    timeline.scrollLeft = Math.max(0, leftPos - (timeline.clientWidth / 2) + 32);
    window.hasAutoScrolled = true;
  }
}

function setupHorizontalScroll() {
  const timeline = document.getElementById("timeline");
  timeline.addEventListener("wheel", (e) => {
    e.preventDefault();
    timeline.scrollLeft += e.deltaY * 2; 
  }, { passive: false });
}

function openModal(slot) {
  state.editing = { slot, block: slot.block };
  
  const title = document.getElementById("modal-title");
  const deleteBtn = document.getElementById("delete-btn");
  
  if (slot.block) {
    title.textContent = `Edit ${slotToTime(slot.slot_index)}`;
    deleteBtn.hidden = false;
  } else {
    title.textContent = `Log ${slotToTime(slot.slot_index)}`;
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
    // Клик по кнопке сразу сохраняет!
    btn.addEventListener("click", () => saveBlock(cat));
    container.appendChild(btn);
  }
}

async function saveBlock(category) {
  const { block } = state.editing;
  
  try {
    if (block) {
      // Обновляем существующий
      await fetchJSON(`/blocks/${block.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
    } else {
      // Создаем новый
      await fetchJSON("/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          block_date: state.date,
          slot_index: state.editing.slot.slot_index,
          category,
        }),
      });
    }
    closeModal();
    await loadDay(state.date);
  } catch (e) {
    alert(`Error: ${e.message}`);
  }
}

async function deleteBlock() {
  if (!state.editing.block) return;
  if (!confirm("Delete this block?")) return;

  try {
    await fetchJSON(`/blocks/${state.editing.block.id}`, { method: "DELETE" });
    closeModal();
    await loadDay(state.date);
  } catch (e) {
    alert(`Error: ${e.message}`);
  }
}

function closeModal() {
  document.getElementById("modal").hidden = true;
  state.editing = null;
}

function init() {
  document.getElementById("date-picker").value = state.date;

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

  document.getElementById("cancel-btn").addEventListener("click", closeModal);
  document.getElementById("delete-btn").addEventListener("click", deleteBlock);
  document.getElementById("modal").addEventListener("click", e => {
    if (e.target.id === "modal") closeModal();
  });

  setupHorizontalScroll();
  setInterval(updateNowLine, 60000);

  loadMeta()
    .then(() => loadDay(state.date))
    .catch(err => {
      document.getElementById("timeline").innerHTML =
        `<p style="color:#ef4444;padding:16px">Failed to load: ${escapeHtml(err.message)}</p>`;
    });
}

document.addEventListener("DOMContentLoaded", init);