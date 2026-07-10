const API = './api/api.php';
const PREVIEW_KEY = 'ribalta:preview';

const state = {
  catalog: [],
  currentId: null,     // null = new script not yet saved
  currentMeta: null,   // row from the API (parent_id, fork_note, …)
};

const views = {
  list: document.getElementById('editor-list'),
  form: document.getElementById('editor-form'),
};

function showView(name) {
  Object.entries(views).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
  window.scrollTo(0, 0);
}

// ---------- API helpers ----------

async function apiGet(params) {
  const res = await fetch(`${API}?${new URLSearchParams(params)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Errore ${res.status}`);
  return data;
}

async function apiPost(params, body) {
  const res = await fetch(`${API}?${new URLSearchParams(params)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Errore ${res.status}`);
  return data;
}

// ---------- List rendering ----------

async function loadCatalog() {
  state.catalog = await apiGet({ action: 'list' });
}

function forkSubtree(rows, root) {
  const out = [];
  (function visit(row, depth) {
    out.push({ row, depth });
    rows.filter(r => r.parent_id === row.id).forEach(c => visit(c, depth + 1));
  })(root, 0);
  return out;
}

function renderListView() {
  ['lettura', 'improv'].forEach(mode => {
    const rows = state.catalog.filter(r => r.mode === mode);
    const roots = rows.filter(r => r.parent_id === null);
    const listEl = document.getElementById(`list-${mode}`);
    const emptyEl = document.getElementById(`empty-${mode}`);
    listEl.innerHTML = '';
    emptyEl.classList.toggle('hidden', roots.length > 0);

    roots.forEach(root => forkSubtree(rows, root).forEach(({ row, depth }) => {
      const li = document.createElement('li');
      li.className = 'draft-row';
      if (depth > 0) li.style.marginLeft = `${Math.min(depth, 4) * 1.1}rem`;

      const btn = document.createElement('button');
      const title = document.createElement('div');
      title.className = 'script-title';
      title.textContent = (depth > 0 ? '↳ ' : '') + row.title;
      btn.appendChild(title);
      const metaParts = [];
      if (row.collection) metaParts.push(row.collection);
      metaParts.push(`${row.actors} personaggi · ${row.scenes} scene`);
      if (depth > 0) metaParts.push(row.fork_note ? `Fork: ${row.fork_note}` : 'Fork');
      if (row.author) metaParts.push(`di ${row.author}`);
      const meta = document.createElement('div');
      meta.className = 'script-meta';
      meta.textContent = metaParts.join(' · ');
      btn.appendChild(meta);
      btn.addEventListener('click', () => openScript(row.id));
      li.appendChild(btn);

      const forkBtn = document.createElement('button');
      forkBtn.className = 'row-delete';
      forkBtn.textContent = 'Forka';
      forkBtn.addEventListener('click', async e => {
        e.stopPropagation();
        const note = prompt('Cosa cambierà in questo fork? (opzionale)') || '';
        try {
          const { id } = await apiPost({ action: 'fork', id: row.id }, { fork_note: note });
          await openScript(id);
        } catch (err) { alert(err.message); }
      });
      li.appendChild(forkBtn);

      const del = document.createElement('button');
      del.className = 'row-delete';
      del.textContent = 'Elimina';
      del.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm(`Eliminare definitivamente «${row.title}»?`)) return;
        try {
          await apiPost({ action: 'delete', id: row.id });
          await loadCatalog();
          renderListView();
        } catch (err) { alert(err.message); }
      });
      li.appendChild(del);

      listEl.appendChild(li);
    }));
  });
}

// ---------- Multi-speaker helpers ----------

function asNamesArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? [...v] : [String(v)];
}

function packNames(arr) {
  if (!arr || arr.length === 0) return undefined;
  if (arr.length === 1) return arr[0];
  return [...arr];
}

function refreshCharacterDatalist() {
  const dl = document.getElementById('characters-suggest');
  if (!dl) return;
  const names = [...document.querySelectorAll('#characters-list .c-name')]
    .map(i => i.value.trim()).filter(Boolean);
  const unique = [...new Set(names)];
  dl.innerHTML = '';
  unique.forEach(n => {
    const opt = document.createElement('option');
    opt.value = n;
    dl.appendChild(opt);
  });
}

function makeTagInput(extraClass, initialValues = []) {
  const root = document.createElement('div');
  root.className = `tag-input ${extraClass}`;

  const typer = document.createElement('input');
  typer.type = 'text';
  typer.className = 'tag-typer';
  typer.setAttribute('list', 'characters-suggest');
  typer.placeholder = 'Aggiungi…';

  let values = [...initialValues];

  function rerender() {
    [...root.querySelectorAll('.chip')].forEach(c => c.remove());
    values.forEach((v, i) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = v;
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'chip-x';
      x.textContent = '×';
      x.addEventListener('click', e => {
        e.stopPropagation();
        values.splice(i, 1);
        rerender();
      });
      chip.appendChild(x);
      root.insertBefore(chip, typer);
    });
  }

  function commit() {
    const v = typer.value.replace(/,$/, '').trim();
    if (v && !values.includes(v)) {
      values.push(v);
      rerender();
    }
    typer.value = '';
  }

  typer.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !typer.value && values.length > 0) {
      values.pop();
      rerender();
    }
  });
  typer.addEventListener('blur', commit);
  typer.addEventListener('input', () => {
    if (typer.value.endsWith(',')) commit();
  });

  root.addEventListener('click', e => {
    if (e.target === root) typer.focus();
  });

  root.appendChild(typer);
  rerender();

  root._tagInput = {
    getValues: () => [...values],
    setValues: arr => { values = [...arr]; rerender(); },
  };
  return root;
}

// ---------- Mode toggling ----------

function currentMode() {
  return document.getElementById('f-mode').value === 'improv' ? 'improv' : 'lettura';
}

function syncModeUI() {
  const form = document.getElementById('editor-form');
  const improv = currentMode() === 'improv';
  form.classList.toggle('editor-mode-improv', improv);
  form.classList.toggle('editor-mode-lettura', !improv);
}

// ---------- Blank / open / new ----------

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

async function openScript(id) {
  try {
    const data = await apiGet({ action: 'get', id });
    state.currentId = data.id;
    state.currentMeta = data;
    scriptToForm(data.content, data);
    document.getElementById('delete-btn').classList.remove('hidden');
    showView('form');
  } catch (err) {
    alert(err.message);
  }
}

function openNewScript() {
  state.currentId = null;
  state.currentMeta = null;
  scriptToForm(buildBlankScript(), null);
  document.getElementById('delete-btn').classList.add('hidden');
  showView('form');
}

// ---------- Form ↔ script ----------

function scriptToForm(script, meta) {
  // title/language live in the row columns; imported .json files carry them
  // inside the document instead — accept both.
  document.getElementById('f-title').value = (meta && meta.title) || script.title || '';
  document.getElementById('f-mode').value = script.mode === 'improv' ? 'improv' : 'lettura';
  document.getElementById('f-language').value = (meta && meta.language) || script.language || 'it';
  document.getElementById('f-collection').value = (meta && meta.collection) || '';
  document.getElementById('f-author').value = (meta && meta.author) || '';
  document.getElementById('f-description').value = script.description || '';

  const forkInfo = document.getElementById('fork-info');
  if (meta && meta.parent_id) {
    forkInfo.textContent = `Fork del copione #${meta.parent_id}` + (meta.fork_note ? ` — ${meta.fork_note}` : '');
    forkInfo.classList.remove('hidden');
  } else {
    forkInfo.classList.add('hidden');
  }

  const p = script.preparation || {};
  document.getElementById('p-premise').value = p.premise || '';
  document.getElementById('p-tone').value = p.tone || '';
  document.getElementById('p-ending').value = p.ending_to_preserve || '';
  document.getElementById('p-rules').value = Array.isArray(p.continuity_rules) ? p.continuity_rules.join('\n') : '';
  const bgEl = document.getElementById('background-list');
  bgEl.innerHTML = '';
  (Array.isArray(p.background) ? p.background : []).forEach(b => appendBackgroundRow(b.title, b.description));

  const flowById = {};
  (Array.isArray(p.scene_flow) ? p.scene_flow : []).forEach(f => {
    if (f && f.scene) flowById[f.scene] = f.summary || '';
  });

  const charsEl = document.getElementById('characters-list');
  charsEl.innerHTML = '';
  (script.characters || []).forEach(c => appendCharacterRow(c.name, c.description, c.never_do));
  if (charsEl.children.length === 0) appendCharacterRow();

  const scenesEl = document.getElementById('scenes-list');
  scenesEl.innerHTML = '';
  (script.scenes || []).forEach(s => appendSceneCard(s, flowById[s.id] || ''));
  if (scenesEl.children.length === 0) appendSceneCard();
  renumberScenes();
  syncModeUI();
}

function formToScript() {
  const improv = currentMode() === 'improv';
  const title = document.getElementById('f-title').value.trim();
  const language = document.getElementById('f-language').value.trim() || 'it';
  const description = document.getElementById('f-description').value.trim();

  const characters = [...document.getElementById('characters-list').children].map(row => {
    const c = {
      name: row.querySelector('.c-name').value.trim(),
      description: row.querySelector('.c-desc').value.trim(),
    };
    if (improv) {
      const nd = row.querySelector('.c-never').value.trim();
      if (nd) c.never_do = nd;
    }
    return c;
  }).filter(c => c.name);

  const sceneFlow = [];
  const scenes = [...document.getElementById('scenes-list').children].map((sceneEl, i) => {
    const id = `scene_${i + 1}`;
    const beats = [...sceneEl.querySelectorAll('.beat-edit-row')].map(row => {
      const type = row.querySelector('.b-type').value;
      const context = row.querySelector('.b-context').value.trim();
      if (type === 'stage_direction') {
        const b = { type, action: row.querySelector('.b-action').value.trim() };
        if (context) b.context = context;
        return b;
      }
      const beat = improv ? {} : { type: 'line' };
      const speaker = packNames(row.querySelector('.b-speaker')._tagInput.getValues());
      const to = packNames(row.querySelector('.b-to')._tagInput.getValues());
      if (speaker !== undefined) beat.speaker = speaker;
      if (to !== undefined) beat.to = to;
      if (improv) {
        beat.context = context;
        const constraint = row.querySelector('.b-constraint').value.trim();
        if (constraint) beat.constraint = constraint;
      } else {
        beat.line = row.querySelector('.b-line').value.trim();
        if (context) beat.context = context;
      }
      return beat;
    });
    const scene = {
      id,
      title: sceneEl.querySelector('.s-title').value.trim() || `Scena ${i + 1}`,
      setting: sceneEl.querySelector('.s-setting').value.trim(),
      beats,
    };
    const music = sceneEl.querySelector('.s-music').value.trim();
    if (music) scene.music = music;
    if (improv) {
      const prep = sceneEl.querySelector('.s-prep').value.trim();
      if (prep) scene.scene_prep = prep;
      const summary = sceneEl.querySelector('.s-summary').value.trim();
      if (summary) sceneFlow.push({ scene: id, summary });
    }
    return scene;
  });

  const script = { title, language, characters, scenes };
  if (description) script.description = description;

  if (improv) {
    script.mode = 'improv';
    const prep = {};
    const premise = document.getElementById('p-premise').value.trim();
    const tone = document.getElementById('p-tone').value.trim();
    const ending = document.getElementById('p-ending').value.trim();
    if (premise) prep.premise = premise;
    if (tone) prep.tone = tone;
    if (ending) prep.ending_to_preserve = ending;
    const rules = document.getElementById('p-rules').value
      .split('\n').map(r => r.trim()).filter(Boolean);
    if (rules.length) prep.continuity_rules = rules;
    const background = [...document.getElementById('background-list').children].map(row => ({
      title: row.querySelector('.bg-title').value.trim(),
      description: row.querySelector('.bg-desc').value.trim(),
    })).filter(b => b.title || b.description);
    if (background.length) prep.background = background;
    if (sceneFlow.length) prep.scene_flow = sceneFlow;
    if (Object.keys(prep).length) script.preparation = prep;
  }

  return script;
}

// ---------- Row builders ----------

function appendBackgroundRow(title = '', description = '') {
  const row = document.createElement('div');
  row.className = 'character-row';
  row.innerHTML = `
    <input class="bg-title" type="text" placeholder="Argomento">
    <textarea class="bg-desc" rows="3" placeholder="Materiale di studio: fatti, nomi, parole utili in scena…"></textarea>
    <button class="row-delete" type="button">Rimuovi</button>
  `;
  row.querySelector('.bg-title').value = title;
  row.querySelector('.bg-desc').value = description;
  row.querySelector('.row-delete').addEventListener('click', () => row.remove());
  document.getElementById('background-list').appendChild(row);
}

function appendCharacterRow(name = '', description = '', neverDo = '') {
  const row = document.createElement('div');
  row.className = 'character-row';
  row.innerHTML = `
    <input class="c-name" type="text" placeholder="Nome">
    <textarea class="c-desc" rows="2" placeholder="Descrizione (opzionale)"></textarea>
    <textarea class="c-never improv-only" rows="2" placeholder="Da non fare (improv)"></textarea>
    <button class="row-delete" type="button">Rimuovi</button>
  `;
  row.querySelector('.c-name').value = name;
  row.querySelector('.c-desc').value = description;
  row.querySelector('.c-never').value = neverDo || '';
  row.querySelector('.c-name').addEventListener('input', refreshCharacterDatalist);
  row.querySelector('.row-delete').addEventListener('click', () => {
    row.remove();
    refreshCharacterDatalist();
  });
  document.getElementById('characters-list').appendChild(row);
  refreshCharacterDatalist();
}

function appendSceneCard(scene, flowSummary = '') {
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
    <div class="form-row improv-only">
      <label>Preparazione della scena <span class="hint">nota per tutto il gruppo</span></label>
      <textarea class="s-prep" rows="2"></textarea>
    </div>
    <div class="form-row improv-only">
      <label>Riassunto per la scaletta <span class="hint">una riga: cosa succede</span></label>
      <textarea class="s-summary" rows="2"></textarea>
    </div>
    <h3>Battute</h3>
    <div class="beats-list"></div>
    <button type="button" class="add-btn add-beat">+ Aggiungi battuta</button>
  `;
  if (scene) {
    card.querySelector('.s-title').value = scene.title || '';
    card.querySelector('.s-setting').value = scene.setting || '';
    card.querySelector('.s-music').value = scene.music || '';
    card.querySelector('.s-prep').value = scene.scene_prep || '';
  }
  card.querySelector('.s-summary').value = flowSummary;
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

function appendBeatRow(beatsEl, beat, insertAfter) {
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
      <div class="form-row" data-slot="speaker">
        <label>Chi parla <span class="hint">scegli un personaggio o scrivi qualsiasi nome (Pubblico, Gruppo…)</span></label>
      </div>
      <div class="form-row" data-slot="to">
        <label>A chi <span class="hint">scegli un personaggio o scrivi qualsiasi nome</span></label>
      </div>
      <div class="form-row lettura-only">
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
      <label class="b-context-label">Contesto</label>
      <textarea class="b-context" rows="2"></textarea>
    </div>
    <div class="form-row improv-only b-constraint-row">
      <label>Vincolo <span class="hint">un paletto: cosa non fare / elemento obbligato</span></label>
      <textarea class="b-constraint" rows="2"></textarea>
    </div>
    <button type="button" class="add-below-btn" title="Aggiungi battuta sotto" aria-label="Aggiungi battuta sotto">+</button>
  `;
  const typeEl = row.querySelector('.b-type');
  const lineFields = row.querySelector('.beat-fields-line');
  const stageFields = row.querySelector('.beat-fields-stage');
  const constraintRow = row.querySelector('.b-constraint-row');
  function syncTypeUI() {
    const isStage = typeEl.value === 'stage_direction';
    lineFields.classList.toggle('hidden', isStage);
    stageFields.classList.toggle('hidden', !isStage);
    constraintRow.classList.toggle('stage-hidden', isStage);
  }
  typeEl.addEventListener('change', syncTypeUI);

  const speakerTI = makeTagInput('b-speaker', asNamesArray(beat && beat.speaker));
  const toTI = makeTagInput('b-to', asNamesArray(beat && beat.to));
  row.querySelector('[data-slot="speaker"]').appendChild(speakerTI);
  row.querySelector('[data-slot="to"]').appendChild(toTI);

  if (beat) {
    typeEl.value = beat.type === 'stage_direction' ? 'stage_direction' : 'line';
    if (beat.type === 'stage_direction') {
      row.querySelector('.b-action').value = beat.action || '';
    } else {
      row.querySelector('.b-line').value = beat.line || '';
      row.querySelector('.b-constraint').value = beat.constraint || '';
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
  row.querySelector('.add-below-btn').addEventListener('click', () => {
    appendBeatRow(beatsEl, undefined, row);
    row.nextElementSibling?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  if (insertAfter) insertAfter.after(row);
  else beatsEl.appendChild(row);
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
  if (!Array.isArray(script.characters) || script.characters.length === 0) return 'Serve almeno un personaggio';
  if (!Array.isArray(script.scenes) || script.scenes.length === 0) return 'Serve almeno una scena';
  return null;
}

// ---------- Action handlers ----------

async function onSave() {
  const script = formToScript();
  const err = validateScript(script);
  if (err) { alert(err); return; }
  // title/language are row columns: send them alongside, not inside, the content.
  const content = { ...script };
  delete content.title;
  delete content.language;
  const body = {
    title: script.title,
    language: script.language,
    content,
    collection: document.getElementById('f-collection').value.trim(),
    author: document.getElementById('f-author').value.trim(),
  };
  try {
    if (state.currentId) {
      await apiPost({ action: 'update', id: state.currentId }, body);
    } else {
      const { id } = await apiPost({ action: 'create' }, body);
      state.currentId = id;
      document.getElementById('delete-btn').classList.remove('hidden');
    }
    alert('Copione salvato.');
  } catch (e) {
    alert(`Salvataggio fallito: ${e.message}`);
  }
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
    state.currentId = null;
    state.currentMeta = null;
    scriptToForm(script, null);
    document.getElementById('delete-btn').classList.add('hidden');
    showView('form');
  };
  reader.readAsText(file);
}

async function onDelete() {
  if (!state.currentId) return;
  if (!confirm('Eliminare definitivamente questo copione dal database?')) return;
  try {
    await apiPost({ action: 'delete', id: state.currentId });
    state.currentId = null;
    state.currentMeta = null;
    await loadCatalog();
    renderListView();
    showView('list');
  } catch (e) {
    alert(e.message);
  }
}

// ---------- Wiring ----------

document.getElementById('new-btn').addEventListener('click', openNewScript);
document.getElementById('import-btn').addEventListener('click', () => {
  document.getElementById('import-input').click();
});
document.getElementById('import-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) onImport(file);
  e.target.value = '';
});
document.getElementById('import-form-btn').addEventListener('click', () => {
  document.getElementById('import-form-input').click();
});
document.getElementById('import-form-input').addEventListener('change', e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let script;
    try { script = JSON.parse(reader.result); }
    catch (err) { alert('File non valido: JSON malformato.'); return; }
    const err = validateScript(script);
    if (err) { alert(`File non valido: ${err}`); return; }
    if (state.currentId && !confirm('Sostituire il contenuto di questo copione con il file? (Diventa definitivo solo con Salva)')) return;
    scriptToForm(script, state.currentMeta);
  };
  reader.readAsText(file);
});
document.getElementById('back-to-list').addEventListener('click', async () => {
  await loadCatalog().catch(() => {});
  renderListView();
  showView('list');
});
document.getElementById('save-btn').addEventListener('click', onSave);
document.getElementById('prova-btn').addEventListener('click', onProva);
document.getElementById('export-btn').addEventListener('click', onExport);
document.getElementById('delete-btn').addEventListener('click', onDelete);
document.getElementById('add-character-btn').addEventListener('click', () => appendCharacterRow());
document.getElementById('add-background-btn').addEventListener('click', () => appendBackgroundRow());
document.getElementById('add-scene-btn').addEventListener('click', () => {
  appendSceneCard();
  renumberScenes();
});
document.getElementById('f-mode').addEventListener('change', syncModeUI);

// ---------- Init ----------

(async function init() {
  try {
    await loadCatalog();
  } catch (e) {
    state.catalog = [];
    alert(`Impossibile caricare i copioni: ${e.message}`);
  }
  renderListView();
  showView('list');
})();
