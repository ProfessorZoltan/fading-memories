import * as webllm from 'https://esm.run/@mlc-ai/web-llm@0.2.79';

const STORAGE_KEY = 'fading-memories.entries.v1';
const INSIGHT_KEY = 'fading-memories.insight.v1';
const INSIGHT_TIMESTAMP_KEY = 'fading-memories.insight.lastAt.v1';
const ENTRY_TTL_MS = 72 * 60 * 60 * 1000;
const SYNTHESIZE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const MODEL_ID = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';

const SYSTEM_PROMPT = `You are reading a person's private journal entries from the past few days. The entries fade after 72 hours and the writer never re-reads them.

Find ONE specific pattern across the entries and describe it in 2-3 short sentences. Look for:
- A feeling that keeps coming up
- A name mentioned multiple times
- Something they keep returning to
- A tension between what they want and what they're doing

Rules:
- Reference specific details from the entries (names, situations, exact short phrases)
- Be direct and concrete, not vague
- No advice, no preamble like "It seems..." or "Based on..."
- 2-3 sentences total, plain prose, no lists or headers
- If the entries are too sparse or unrelated to find a real pattern, say so in one sentence`;

const $ = (sel) => document.querySelector(sel);
const input = $('#entry-input');
const charCount = $('#char-count');
const saveBtn = $('#save-btn');
const list = $('#entries-list');
const emptyState = $('#empty-state');
const synthBtn = $('#synthesize-btn');
const actionsHint = $('#actions-hint');
const progressBox = $('#progress-box');
const progressBar = $('#progress-bar');
const progressLabel = $('#progress-label');
const insightSection = $('#insight-section');
const insightText = $('#insight-text');
const dismissInsightBtn = $('#dismiss-insight');

let engine = null;
let engineLoading = null;

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
  actionsHint.textContent = engine
    ? 'Read once, then it disappears.'
    : 'First time loads a small model (~400MB) into your browser. After that it runs offline.';
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

function setProgress(visible, label, ratio) {
  progressBox.hidden = !visible;
  if (label != null) progressLabel.textContent = label;
  if (ratio != null) progressBar.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
}

async function getEngine() {
  if (engine) return engine;
  if (engineLoading) return engineLoading;

  if (!('gpu' in navigator)) {
    throw new Error(
      'Your browser does not support WebGPU, which the on-device model needs. Try the latest Chrome, Edge, or Safari 17.4+.',
    );
  }

  engineLoading = (async () => {
    setProgress(true, 'Preparing model…', 0);
    const created = await webllm.CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (report) => {
        setProgress(true, report.text || 'Loading…', report.progress ?? 0);
      },
    });
    setProgress(false);
    engine = created;
    return created;
  })();

  try {
    return await engineLoading;
  } catch (err) {
    engineLoading = null;
    setProgress(false);
    throw err;
  }
}

function formatEntriesForModel(entries) {
  return entries
    .map((e, i) => {
      const when = new Date(e.createdAt).toISOString().slice(0, 10);
      return `Entry ${i + 1} (${when}):\n${e.text}`;
    })
    .join('\n\n---\n\n');
}

async function runSynthesis(entries) {
  const eng = await getEngine();
  setProgress(true, 'Reading your entries…', 1);

  const reply = await eng.chat.completions.create({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: formatEntriesForModel(entries) },
    ],
    temperature: 0.7,
    max_tokens: 256,
  });

  setProgress(false);
  return (reply.choices[0]?.message?.content || '').trim();
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
  const originalLabel = synthBtn.textContent;
  synthBtn.textContent = 'Working…';
  actionsHint.textContent = '';

  try {
    const insight = await runSynthesis(entries);
    if (!insight) throw new Error('The model returned an empty response. Try again.');
    localStorage.setItem(INSIGHT_KEY, insight);
    localStorage.setItem(INSIGHT_TIMESTAMP_KEY, String(Date.now()));
    showStoredInsight();
    render();
  } catch (err) {
    actionsHint.textContent = err.message || 'Could not surface a pattern right now.';
  } finally {
    synthBtn.disabled = false;
    synthBtn.textContent = originalLabel;
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
