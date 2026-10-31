const state = {
  date: todayISO(),
  categories: [],
  statuses: [],
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
    try {
      const body = await r.json();
      if (body.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch (_) {}
    throw new Error(detail);
  }
  return r.status === 204 ? null : r.json();
}

async function loadMeta() {
  const data = await fetchJSON("/meta");
  state.categories = data.categories;
  state.statuses = data.statuses;
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
  let energySum = 0, energyCount = 0;

  for (const s of filled) {
    counts[s.block.category] = (counts[s.block.category] || 0) + 1;
    if (s.block.energy != null) {
      energySum += s.block.energy;
      energyCount++;
    }
  }

  const avg = energyCount ? (energySum / energyCount).toFixed(1) : "—";
  const parts = Object.entries(counts)
    .map(([c, n]) => `${c}: ${n}`)
    .join(" · ");

  document.getElementById("stats").innerHTML = `
    <span>blocks: <b>${filled.length}</b>/48</span>
    <span>avg energy: <b>${avg}</b></span>
    ${parts ? `<span>${escapeHtml(parts)}</span>` : ""}
  `;
}

function renderTimeline() {
  const el = document.getElementById("timeline");
  el.innerHTML = "";

  for (const slot of state.grid.slots) {
    const row = document.createElement("div");
    row.className = "slot";
    const block = slot.block;
    const time = slotToTime(slot.slot_index);

    if (block) {
      row.classList.add("filled", `cat-${block.category}`);
      const energy = block.energy != null ? ` · ⚡${block.energy}` : "";
      const notes = block.notes ? ` · ${escapeHtml(block.notes)}` : "";
      row.innerHTML = `
        <span class="time">${time}</span>
        <span class="content">
          <span class="cat">${escapeHtml(block.category)}</span>
          <span class="meta">${escapeHtml(block.status)}${energy}${notes}</span>
        </span>`;
    } else {
      row.classList.add("empty");
      row.innerHTML = `
        <span class="time">${time}</span>
        <span class="content"></span>`;
    }

    row.addEventListener("click", () => openModal(slot));
    el.appendChild(row);
  }
}

function openModal(slot) {
  state.editing = {
    slot,
    block: slot.block,
    selectedCategory: slot.block ? slot.block.category : null,
  };

  const title = document.getElementById("modal-title");
  const deleteBtn = document.getElementById("delete-btn");

  if (slot.block) {
    title.textContent = `Edit ${slotToTime(slot.slot_index)}`;
    deleteBtn.hidden = false;
    document.getElementById("status-select").value = slot.block.status;
    document.getElementById("energy-input").value = slot.block.energy ?? 3;
    document.getElementById("energy-value").textContent = slot.block.energy ?? 3;
    document.getElementById("notes-input").value = slot.block.notes ?? "";
  } else {
    title.textContent = `Add block ${slotToTime(slot.slot_index)}`;
    deleteBtn.hidden = true;
    document.getElementById("status-select").value = "done";
    document.getElementById("energy-input").value = 3;
    document.getElementById("energy-value").textContent = 3;
    document.getElementById("notes-input").value = "";
  }

  renderCategorySelect();
  document.getElementById("modal").hidden = false;
}

function setSelectedCategory(cat) {
  state.editing.selectedCategory = cat;
  document.querySelectorAll(".category-btn").forEach(b => {
    b.classList.toggle("selected", b.dataset.cat === cat);
  });
}

function renderCategorySelect() {
  const container = document.getElementById("category-select");
  container.innerHTML = "";

  for (const cat of state.categories) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `category-btn cat-${cat}`;
    btn.dataset.cat = cat;
    btn.textContent = cat;
    if (cat === state.editing.selectedCategory) btn.classList.add("selected");
    btn.addEventListener("click", () => setSelectedCategory(cat));
    container.appendChild(btn);
  }
}

async function saveBlock() {
  if (!state.editing.selectedCategory) {
    alert("Choose a category");
    return;
  }

  const { block, selectedCategory } = state.editing;
  const payload = {
    category: selectedCategory,
    status: document.getElementById("status-select").value,
    energy: Number(document.getElementById("energy-input").value),
    notes: document.getElementById("notes-input").value.trim() || null,
  };

  try {
    if (block) {
      await fetchJSON(`/blocks/${block.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetchJSON("/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          block_date: state.date,
          slot_index: state.editing.slot.slot_index,
          ...payload,
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
    loadDay(e.target.value).catch(err => alert(err.message));
  });

  document.getElementById("today-btn").addEventListener("click", () => {
    const t = todayISO();
    document.getElementById("date-picker").value = t;
    loadDay(t).catch(err => alert(err.message));
  });

  document.getElementById("save-btn").addEventListener("click", saveBlock);
  document.getElementById("cancel-btn").addEventListener("click", closeModal);
  document.getElementById("delete-btn").addEventListener("click", deleteBlock);

  document.getElementById("energy-input").addEventListener("input", e => {
    document.getElementById("energy-value").textContent = e.target.value;
  });

  document.getElementById("modal").addEventListener("click", e => {
    if (e.target.id === "modal") closeModal();
  });

  loadMeta()
    .then(() => loadDay(state.date))
    .catch(err => {
      document.getElementById("timeline").innerHTML =
        `<p style="color:#dc2626;padding:16px">Failed to load: ${escapeHtml(err.message)}</p>`;
    });
}

document.addEventListener("DOMContentLoaded", init);