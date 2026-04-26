const STORAGE_KEY = 'fading-memories.entries.v1';
const ENTRY_TTL_MS = 72 * 60 * 60 * 1000;

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
  if (hours >= 1) return `${hours}h ${minutes}m left`;
  if (minutes >= 1) return `${minutes}m left`;
  return '<1m left';
}

function fadeOpacity(createdAt) {
  const age = Date.now() - createdAt;
  const ratio = Math.min(1, Math.max(0, age / ENTRY_TTL_MS));
  return 1 - ratio * 0.55;
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
      li.style.opacity = fadeOpacity(e.createdAt).toFixed(2);

      const p = document.createElement('p');
      p.className = 'entry-text';
      p.textContent = e.text;

      const meta = document.createElement('div');
      meta.className = 'entry-meta';

      const fade = document.createElement('span');
      fade.className = 'entry-fade';
      fade.textContent = formatRemaining(ENTRY_TTL_MS - (Date.now() - e.createdAt));

      const del = document.createElement('button');
      del.className = 'entry-delete';
      del.type = 'button';
      del.textContent = 'delete now';
      del.addEventListener('click', () => deleteEntry(e.id));

      meta.appendChild(fade);
      meta.appendChild(del);

      li.appendChild(p);
      li.appendChild(meta);
      list.appendChild(li);
    }
  }
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
setInterval(render, 60 * 1000);
