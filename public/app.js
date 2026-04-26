const STORAGE_KEY = 'fading-memories.entries.v1';
const INSIGHT_KEY = 'fading-memories.insight.v1';
const INSIGHT_TIMESTAMP_KEY = 'fading-memories.insight.lastAt.v1';
const ENTRY_TTL_MS = 72 * 60 * 60 * 1000;
const SYNTHESIZE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const $ = (sel) => document.querySelector(sel);
const input = $('#entry-input');
const charCount = $('#char-count');
const saveBtn = $('#save-btn');
const list = $('#entries-list');
const emptyState = $('#empty-state');
const synthBtn = $('#synthesize-btn');
const actionsHint = $('#actions-hint');
const insightSection = $('#insight-section');
const insightText = $('#insight-text');
const dismissInsightBtn = $('#dismiss-insight');

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

  updateSynthesizeButton(entries);
}

function updateSynthesizeButton(entries) {
  const hasInsight = !!localStorage.getItem(INSIGHT_KEY);
  if (hasInsight) {
    synthBtn.hidden = true;
    actionsHint.textContent = '';
    return;
  }

  const lastAt = Number(localStorage.getItem(INSIGHT_TIMESTAMP_KEY) || 0);
  const sinceLast = Date.now() - lastAt;
  const cooldownLeft = SYNTHESIZE_COOLDOWN_MS - sinceLast;

  if (entries.length < 3) {
    synthBtn.hidden = true;
    actionsHint.textContent = 'Write at least three entries to surface a pattern.';
    return;
  }

  if (lastAt && cooldownLeft > 0) {
    synthBtn.hidden = true;
    const days = Math.ceil(cooldownLeft / (24 * 60 * 60 * 1000));
    actionsHint.textContent = `Next synthesis available in ${days} day${days === 1 ? '' : 's'}.`;
    return;
  }

  synthBtn.hidden = false;
  actionsHint.textContent = 'Read once, then it disappears.';
}

function showStoredInsight() {
  const stored = localStorage.getItem(INSIGHT_KEY);
  if (stored) {
    insightText.textContent = stored;
    insightSection.hidden = false;
  } else {
    insightSection.hidden = true;
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

synthBtn.addEventListener('click', async () => {
  const entries = pruneExpired(loadEntries());
  if (entries.length < 3) return;

  synthBtn.disabled = true;
  synthBtn.textContent = 'Reading…';

  try {
    const res = await fetch('/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: entries.map((e) => ({ text: e.text, createdAt: e.createdAt })),
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Synthesis failed.');
    }

    const data = await res.json();
    if (!data.insight) throw new Error('No insight returned.');

    localStorage.setItem(INSIGHT_KEY, data.insight);
    localStorage.setItem(INSIGHT_TIMESTAMP_KEY, String(Date.now()));
    showStoredInsight();
    render();
  } catch (err) {
    actionsHint.textContent = err.message || 'Could not surface a pattern right now.';
  } finally {
    synthBtn.disabled = false;
    synthBtn.textContent = 'Surface a pattern from this week';
  }
});

dismissInsightBtn.addEventListener('click', () => {
  localStorage.removeItem(INSIGHT_KEY);
  insightSection.hidden = true;
  render();
});

saveBtn.disabled = true;
showStoredInsight();
render();
setInterval(render, 60 * 1000);
