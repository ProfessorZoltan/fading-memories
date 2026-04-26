/* ==========================================================================
   Fading Memories — public/app.js
   Drop-in replacement. Same DOM ids, same storage key, same public behavior.
   New: time-aware fade curve (sharp collapse in the final hour) + "nearly
   gone" label + per-minute re-render that drops to per-second in the final
   hour so the bleed is visible in real time.
   ========================================================================== */

const STORAGE_KEY = 'fading-memories.entries.v1';
const ENTRY_TTL_MS = 72 * 60 * 60 * 1000;
const FINAL_HOUR_MS = 60 * 60 * 1000;

const $ = (sel) => document.querySelector(sel);
const input = $('#entry-input');
const charCount = $('#char-count');
const saveBtn = $('#save-btn');
const list = $('#entries-list');
const emptyState = $('#empty-state');

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function pruneExpired(entries) {
  const now = Date.now();
  return entries.filter((e) => now - e.createdAt < ENTRY_TTL_MS);
}

function formatRemaining(ms) {
  if (ms <= 0) return 'fading…';
  const totalMin = Math.floor(ms / 60000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours >= 1) return `${hours}h ${minutes.toString().padStart(2, '0')}m left`;
  if (minutes >= 1) return `${minutes}m left`;
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `${sec}s left`;
}

/* Linear — steady fade.
   Returns { opacity, blur, desat, spread } as a smooth linear function of
   age across the full 72-hour life. Opacity goes 1.0 → 0.15. */
function fadeFor(createdAt) {
  const age = Math.max(0, Date.now() - createdAt);
  const r = Math.min(1, age / ENTRY_TTL_MS);
  return {
    opacity: 1 - r * 0.85,
    blur: r * 0.6,
    desat: r * 0.4,
    spread: r * 0.3,
  };
}

function applyFade(li, createdAt) {
  const f = fadeFor(createdAt);
  li.style.setProperty('--entry-opacity', f.opacity.toFixed(3));
  li.style.setProperty('--entry-blur', f.blur.toFixed(3));
  li.style.setProperty('--entry-desat', f.desat.toFixed(3));
  li.style.setProperty('--entry-spread', f.spread.toFixed(3));
}

function render() {
  const entries = pruneExpired(loadEntries()).sort((a, b) => b.createdAt - a.createdAt);
  saveEntries(entries);

  list.innerHTML = '';
  if (entries.length === 0) {
    emptyState.hidden = false;
  } else {
    emptyState.hidden = true;
    for (const e of entries) {
      const li = document.createElement('li');
      li.className = 'entry';
      applyFade(li, e.createdAt);

      const p = document.createElement('p');
      p.className = 'entry-text';
      p.textContent = e.text;

      const meta = document.createElement('div');
      meta.className = 'entry-meta';

      const fade = document.createElement('span');
      fade.className = 'entry-fade';
      fade.textContent = formatRemaining(ENTRY_TTL_MS - (Date.now() - e.createdAt));

      const right = document.createElement('span');
      right.className = 'entry-meta-right';
      right.style.display = 'inline-flex';
      right.style.alignItems = 'center';
      right.style.gap = '0.4rem';

      const remaining = ENTRY_TTL_MS - (Date.now() - e.createdAt);
      if (remaining < FINAL_HOUR_MS && remaining > 0) {
        const tag = document.createElement('span');
        tag.className = 'entry-final';
        tag.textContent = 'nearly gone';
        right.appendChild(tag);
      }

      const del = document.createElement('button');
      del.className = 'entry-delete';
      del.type = 'button';
      del.textContent = 'delete now';
      del.addEventListener('click', () => deleteEntry(e.id));
      right.appendChild(del);

      meta.appendChild(fade);
      meta.appendChild(right);

      li.appendChild(p);
      li.appendChild(meta);
      list.appendChild(li);
    }
  }

  scheduleNextTick();
}

/* Tick scheduler: 60s normally, 1s if any entry is in its final hour, so the
   bleed animates visibly without burning CPU when nothing is close to fading. */
let tickTimer = null;
function scheduleNextTick() {
  if (tickTimer) clearTimeout(tickTimer);
  const entries = loadEntries();
  const now = Date.now();
  const anyFinalHour = entries.some((e) => {
    const remaining = ENTRY_TTL_MS - (now - e.createdAt);
    return remaining > 0 && remaining < FINAL_HOUR_MS;
  });
  tickTimer = setTimeout(render, anyFinalHour ? 1000 : 60 * 1000);
}

function deleteEntry(id) {
  const entries = loadEntries().filter((e) => e.id !== id);
  saveEntries(entries);
  render();
}

function addEntry(text) {
  const entry = {
    id: crypto.randomUUID(),
    text,
    createdAt: Date.now(),
  };
  const entries = loadEntries();
  entries.push(entry);
  saveEntries(entries);
}

input.addEventListener('input', () => {
  charCount.textContent = `${input.value.length} character${input.value.length === 1 ? '' : 's'}`;
  saveBtn.disabled = input.value.trim().length === 0;
});

saveBtn.addEventListener('click', () => {
  const text = input.value.trim();
  if (!text) return;
  addEntry(text);
  input.value = '';
  charCount.textContent = '0 characters';
  saveBtn.disabled = true;
  render();
});

input.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    saveBtn.click();
  }
});

saveBtn.disabled = true;
render();
