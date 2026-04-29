const DRAFT_KEY = 'ribalta:drafts';
const PREVIEW_KEY = 'ribalta:preview';

const state = {
  drafts: {},
  manifest: [],
  currentDraftId: null,
};

const views = {
  list: document.getElementById('editor-list'),
  form: document.getElementById('editor-form'),
};

function showView(name) {
  Object.entries(views).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
  window.scrollTo(0, 0);
}

// ---------- Drafts persistence ----------

function loadDrafts() {
  const raw = localStorage.getItem(DRAFT_KEY);
  state.drafts = raw ? JSON.parse(raw) : {};
}

function persistDrafts() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(state.drafts));
}

function newDraftId() {
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function putDraft(draft) {
  state.drafts[draft.meta.id] = draft;
  persistDrafts();
}

function removeDraft(id) {
  delete state.drafts[id];
  persistDrafts();
}

// ---------- Manifest tree walk ----------

async function walkManifest(path = '') {
  const res = await fetch(`./scripts/${path}index.json`);
  if (!res.ok) return [];
  const entries = await res.json();
  const out = [];
  for (const entry of entries) {
    if (entry.folder) {
      const sub = await walkManifest(`${path}${entry.folder}/`);
      out.push(...sub);
    } else if (entry.file) {
      out.push({ path, file: entry.file, title: entry.title });
    }
  }
  return out;
}

// ---------- List rendering ----------

function renderListView() {
  const draftsList = document.getElementById('drafts-list');
  const empty = document.getElementById('drafts-empty');
  draftsList.innerHTML = '';
  const ids = Object.keys(state.drafts).sort((a, b) =>
    (state.drafts[b].meta.savedAt || 0) - (state.drafts[a].meta.savedAt || 0)
  );
  empty.classList.toggle('hidden', ids.length > 0);
  ids.forEach(id => {
    const d = state.drafts[id];
    const li = document.createElement('li');
    li.className = 'draft-row';
    const btn = document.createElement('button');
    const title = document.createElement('div');
    title.className = 'script-title';
    title.textContent = d.meta.title || '(senza titolo)';
    btn.appendChild(title);
    const meta = document.createElement('div');
    meta.className = 'script-meta';
    const ts = d.meta.savedAt ? new Date(d.meta.savedAt).toLocaleString('it-IT') : '';
    const src = d.meta.source && d.meta.source.type === 'manifest'
      ? ` · forkato da ${d.meta.source.path}${d.meta.source.file}`
      : '';
    meta.textContent = `Salvato ${ts}${src}`;
    btn.appendChild(meta);
    btn.addEventListener('click', () => openDraft(id));
    li.appendChild(btn);

    const del = document.createElement('button');
    del.className = 'row-delete';
    del.textContent = 'Elimina';
    del.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm('Eliminare definitivamente questa bozza?')) {
        removeDraft(id);
        renderListView();
      }
    });
    li.appendChild(del);
    draftsList.appendChild(li);
  });

  const manifestList = document.getElementById('manifest-list');
  manifestList.innerHTML = '';
  state.manifest.forEach(entry => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    const title = document.createElement('div');
    title.className = 'script-title';
    title.textContent = entry.title;
    btn.appendChild(title);
    if (entry.path) {
      const meta = document.createElement('div');
      meta.className = 'script-meta';
      meta.textContent = entry.path + entry.file;
      btn.appendChild(meta);
    }
    btn.addEventListener('click', () => forkManifest(entry));
    li.appendChild(btn);
    manifestList.appendChild(li);
  });
}

// ---------- Multi-speaker helpers ----------

function joinNames(v) {
  if (v == null) return '';
  return Array.isArray(v) ? v.join(', ') : String(v);
}

function serializeNames(s) {
  const parts = (s || '').split(',').map(x => x.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return parts;
}

// ---------- Blank / open / fork ----------

function buildBlankScript() {
  return {
    title: '',
    language: 'it',
    description: '',
    characters: [{ name: '', description: '' }],
    scenes: [{
      id: 'scene_1',
      title: 'Scena 1',
      setting: '',
      beats: [{ type: 'line', speaker: '', to: '', line: '', context: '' }]
    }]
  };
}

function newDraftFromScript(script, source) {
  const id = newDraftId();
  const draft = {
    meta: { id, title: script.title || '(senza titolo)', savedAt: Date.now(), source: source || null },
    script,
  };
  putDraft(draft);
  return id;
}

async function forkManifest(entry) {
  const res = await fetch(`./scripts/${entry.path}${entry.file}`);
  const script = await res.json();
  const id = newDraftFromScript(script, { type: 'manifest', path: entry.path, file: entry.file });
  openDraft(id);
}

function openDraft(id) {
  state.currentDraftId = id;
  scriptToForm(state.drafts[id].script);
  document.getElementById('delete-btn').classList.remove('hidden');
  showView('form');
}

function openNewDraft() {
  const id = newDraftFromScript(buildBlankScript(), null);
  state.currentDraftId = id;
  scriptToForm(state.drafts[id].script);
  document.getElementById('delete-btn').classList.remove('hidden');
  renderListView();
  showView('form');
}

// ---------- Form ↔ script ----------

function scriptToForm(script) {
  document.getElementById('f-title').value = script.title || '';
  document.getElementById('f-language').value = script.language || 'it';
  document.getElementById('f-description').value = script.description || '';

  const charsEl = document.getElementById('characters-list');
  charsEl.innerHTML = '';
  (script.characters || []).forEach(c => appendCharacterRow(c.name, c.description));
  if (charsEl.children.length === 0) appendCharacterRow();

  const scenesEl = document.getElementById('scenes-list');
  scenesEl.innerHTML = '';
  (script.scenes || []).forEach(s => appendSceneCard(s));
  if (scenesEl.children.length === 0) appendSceneCard();
  renumberScenes();
}

function formToScript() {
  const title = document.getElementById('f-title').value.trim();
  const language = document.getElementById('f-language').value.trim() || 'it';
  const description = document.getElementById('f-description').value.trim();

  const characters = [...document.getElementById('characters-list').children].map(row => ({
    name: row.querySelector('.c-name').value.trim(),
    description: row.querySelector('.c-desc').value.trim(),
  })).filter(c => c.name);

  const scenes = [...document.getElementById('scenes-list').children].map((sceneEl, i) => {
    const beats = [...sceneEl.querySelectorAll('.beat-edit-row')].map(row => {
      const type = row.querySelector('.b-type').value;
      const context = row.querySelector('.b-context').value.trim();
      if (type === 'stage_direction') {
        return { type, action: row.querySelector('.b-action').value.trim(), context };
      }
      const beat = { type: 'line' };
      const speaker = serializeNames(row.querySelector('.b-speaker').value);
      const to = serializeNames(row.querySelector('.b-to').value);
      if (speaker !== undefined) beat.speaker = speaker;
      if (to !== undefined) beat.to = to;
      beat.line = row.querySelector('.b-line').value.trim();
      beat.context = context;
      return beat;
    });
    const scene = {
      id: `scene_${i + 1}`,
      title: sceneEl.querySelector('.s-title').value.trim() || `Scena ${i + 1}`,
      setting: sceneEl.querySelector('.s-setting').value.trim(),
      beats,
    };
    const music = sceneEl.querySelector('.s-music').value.trim();
    if (music) scene.music = music;
    return scene;
  });

  const script = { title, language, characters, scenes };
  if (description) script.description = description;
  return script;
}

// ---------- Row builders ----------

function appendCharacterRow(name = '', description = '') {
  const row = document.createElement('div');
  row.className = 'character-row';
  row.innerHTML = `
    <input class="c-name" type="text" placeholder="Nome">
    <textarea class="c-desc" rows="2" placeholder="Descrizione (opzionale)"></textarea>
    <button class="row-delete" type="button">Rimuovi</button>
  `;
  row.querySelector('.c-name').value = name;
  row.querySelector('.c-desc').value = description;
  row.querySelector('.row-delete').addEventListener('click', () => row.remove());
  document.getElementById('characters-list').appendChild(row);
}

function appendSceneCard(scene) {
  const card = document.createElement('div');
  card.className = 'scene-edit-card';
  card.innerHTML = `
    <div class="scene-edit-header">
      <span class="scene-num"></span>
      <div class="row-controls">
        <button type="button" class="move-up">↑</button>
        <button type="button" class="move-down">↓</button>
        <button type="button" class="row-delete">Rimuovi scena</button>
      </div>
    </div>
    <div class="form-row">
      <label>Titolo</label>
      <input class="s-title" type="text">
    </div>
    <div class="form-row">
      <label>Ambientazione</label>
      <textarea class="s-setting" rows="2"></textarea>
    </div>
    <div class="form-row">
      <label>Musica (opzionale)</label>
      <input class="s-music" type="text">
    </div>
    <h3>Battute</h3>
    <div class="beats-list"></div>
    <button type="button" class="add-btn add-beat">+ Aggiungi battuta</button>
  `;
  if (scene) {
    card.querySelector('.s-title').value = scene.title || '';
    card.querySelector('.s-setting').value = scene.setting || '';
    card.querySelector('.s-music').value = scene.music || '';
  }
  const beatsEl = card.querySelector('.beats-list');
  card.querySelector('.add-beat').addEventListener('click', () => appendBeatRow(beatsEl));
  card.querySelector('.move-up').addEventListener('click', () => {
    const prev = card.previousElementSibling;
    if (prev) card.parentNode.insertBefore(card, prev);
    renumberScenes();
  });
  card.querySelector('.move-down').addEventListener('click', () => {
    const next = card.nextElementSibling;
    if (next) card.parentNode.insertBefore(next, card);
    renumberScenes();
  });
  card.querySelector('.row-delete').addEventListener('click', () => {
    card.remove();
    renumberScenes();
  });

  document.getElementById('scenes-list').appendChild(card);

  if (scene && scene.beats) {
    scene.beats.forEach(b => appendBeatRow(beatsEl, b));
  } else {
    appendBeatRow(beatsEl);
  }
}

function appendBeatRow(beatsEl, beat) {
  const row = document.createElement('div');
  row.className = 'beat-edit-row';
  row.innerHTML = `
    <div class="beat-edit-header">
      <select class="b-type">
        <option value="line">Battuta</option>
        <option value="stage_direction">Indicazione scenica</option>
      </select>
      <div class="row-controls">
        <button type="button" class="move-up">↑</button>
        <button type="button" class="move-down">↓</button>
        <button type="button" class="row-delete">Rimuovi</button>
      </div>
    </div>
    <div class="beat-fields-line">
      <div class="form-row">
        <label>Chi parla <span class="hint">Più nomi separati da virgola</span></label>
        <input class="b-speaker" type="text">
      </div>
      <div class="form-row">
        <label>A chi <span class="hint">Più nomi separati da virgola</span></label>
        <input class="b-to" type="text">
      </div>
      <div class="form-row">
        <label>Battuta</label>
        <textarea class="b-line" rows="3"></textarea>
      </div>
    </div>
    <div class="beat-fields-stage hidden">
      <div class="form-row">
        <label>Azione</label>
        <textarea class="b-action" rows="2"></textarea>
      </div>
    </div>
    <div class="form-row">
      <label>Contesto</label>
      <textarea class="b-context" rows="2"></textarea>
    </div>
  `;
  const typeEl = row.querySelector('.b-type');
  const lineFields = row.querySelector('.beat-fields-line');
  const stageFields = row.querySelector('.beat-fields-stage');
  function syncTypeUI() {
    const isStage = typeEl.value === 'stage_direction';
    lineFields.classList.toggle('hidden', isStage);
    stageFields.classList.toggle('hidden', !isStage);
  }
  typeEl.addEventListener('change', syncTypeUI);

  if (beat) {
    typeEl.value = beat.type || 'line';
    if (beat.type === 'stage_direction') {
      row.querySelector('.b-action').value = beat.action || '';
    } else {
      row.querySelector('.b-speaker').value = joinNames(beat.speaker);
      row.querySelector('.b-to').value = joinNames(beat.to);
      row.querySelector('.b-line').value = beat.line || '';
    }
    row.querySelector('.b-context').value = beat.context || '';
  }
  syncTypeUI();

  row.querySelector('.move-up').addEventListener('click', () => {
    const prev = row.previousElementSibling;
    if (prev) row.parentNode.insertBefore(row, prev);
  });
  row.querySelector('.move-down').addEventListener('click', () => {
    const next = row.nextElementSibling;
    if (next) row.parentNode.insertBefore(next, row);
  });
  row.querySelector('.row-delete').addEventListener('click', () => row.remove());

  beatsEl.appendChild(row);
}

function renumberScenes() {
  [...document.getElementById('scenes-list').children].forEach((card, i) => {
    card.querySelector('.scene-num').textContent = `Scena ${i + 1}`;
  });
}

// ---------- Slug ----------

function slugify(s) {
  return (s || 'copione').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'copione';
}

// ---------- Validation ----------

function validateScript(script) {
  if (!script || typeof script !== 'object') return 'JSON non valido';
  if (!script.title || typeof script.title !== 'string') return 'Manca il titolo';
  if (!Array.isArray(script.characters)) return 'characters deve essere un array';
  if (!Array.isArray(script.scenes)) return 'scenes deve essere un array';
  return null;
}

// ---------- Action handlers ----------

function onSave() {
  const script = formToScript();
  const draft = state.drafts[state.currentDraftId];
  draft.script = script;
  draft.meta.title = script.title || '(senza titolo)';
  draft.meta.savedAt = Date.now();
  persistDrafts();
  alert('Bozza salvata.');
}

function onProva() {
  const script = formToScript();
  if (!script.title) { alert('Aggiungi un titolo prima di provare.'); return; }
  if (script.scenes.length === 0 || script.scenes.every(s => s.beats.length === 0)) {
    alert('Aggiungi almeno una battuta prima di provare.'); return;
  }
  localStorage.setItem(PREVIEW_KEY, JSON.stringify(script));
  window.location.href = './index.html?preview=1';
}

function onExport() {
  const script = formToScript();
  const blob = new Blob([JSON.stringify(script, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(script.title)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function onImport(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let script;
    try { script = JSON.parse(reader.result); }
    catch (e) { alert('File non valido: JSON malformato.'); return; }
    const err = validateScript(script);
    if (err) { alert(`File non valido: ${err}`); return; }
    const id = newDraftFromScript(script, null);
    renderListView();
    openDraft(id);
  };
  reader.readAsText(file);
}

function onDelete() {
  if (!state.currentDraftId) return;
  if (!confirm('Eliminare definitivamente questa bozza?')) return;
  removeDraft(state.currentDraftId);
  state.currentDraftId = null;
  renderListView();
  showView('list');
}

// ---------- Wiring ----------

document.getElementById('new-btn').addEventListener('click', openNewDraft);
document.getElementById('import-btn').addEventListener('click', () => {
  document.getElementById('import-input').click();
});
document.getElementById('import-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) onImport(file);
  e.target.value = '';
});
document.getElementById('back-to-list').addEventListener('click', () => {
  renderListView();
  showView('list');
});
document.getElementById('save-btn').addEventListener('click', onSave);
document.getElementById('prova-btn').addEventListener('click', onProva);
document.getElementById('export-btn').addEventListener('click', onExport);
document.getElementById('delete-btn').addEventListener('click', onDelete);
document.getElementById('add-character-btn').addEventListener('click', () => appendCharacterRow());
document.getElementById('add-scene-btn').addEventListener('click', () => {
  appendSceneCard();
  renumberScenes();
});

// ---------- Init ----------

(async function init() {
  loadDrafts();
  try {
    state.manifest = await walkManifest('');
  } catch (e) {
    state.manifest = [];
  }
  renderListView();
  showView('list');
})();
