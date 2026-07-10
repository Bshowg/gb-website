const API = './api/api.php';
const MODE_KEY = 'ribalta:mode';

const state = {
  catalog: [],
  collection: null,
  script: null,
  scriptMeta: null,
  characters: [],
  sceneIdx: 0,
  beatIdx: 0,
  mode: 'lettura',
  previewMode: false,
};

function isImprovScript() {
  return state.script && state.script.mode === 'improv';
}

const CHARACTER_PALETTE = [
  '#e0bd72',
  '#7bb4e8',
  '#e89b7b',
  '#9bd17a',
  '#d896d8',
  '#7be0c4',
  '#e87b9b',
  '#c4a8e8',
];

function characterColor(name) {
  if (!state.script || !name) return CHARACTER_PALETTE[0];
  const idx = state.script.characters.findIndex(c => c.name === name);
  if (idx < 0) return CHARACTER_PALETTE[0];
  return CHARACTER_PALETTE[idx % CHARACTER_PALETTE.length];
}

const views = {
  scripts: document.getElementById('view-scripts'),
  versions: document.getElementById('view-versions'),
  characters: document.getElementById('view-characters'),
  prep: document.getElementById('view-prep'),
  playback: document.getElementById('view-playback'),
  readall: document.getElementById('view-readall'),
  end: document.getElementById('view-end'),
};

function showView(name) {
  Object.entries(views).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
  if (name !== 'playback') {
    const sheet = document.getElementById('info-sheet');
    if (sheet && !sheet.classList.contains('hidden')) closeInfoSheet();
  }
}

function asArray(v) {
  return Array.isArray(v) ? v : [v];
}

function currentScene() { return state.script.scenes[state.sceneIdx]; }
function currentBeat()  { return currentScene().beats[state.beatIdx]; }

function nextBeat() {
  let s = state.sceneIdx, b = state.beatIdx + 1;
  while (s < state.script.scenes.length) {
    const scene = state.script.scenes[s];
    if (b < scene.beats.length) return { beat: scene.beats[b], sceneIdx: s };
    s++; b = 0;
  }
  return null;
}

function prevBeat() {
  if (state.beatIdx > 0) return state.script.scenes[state.sceneIdx].beats[state.beatIdx - 1];
  let s = state.sceneIdx - 1;
  while (s >= 0) {
    const scene = state.script.scenes[s];
    if (scene.beats.length > 0) return scene.beats[scene.beats.length - 1];
    s--;
  }
  return null;
}

function beatText(beat) {
  if (!beat) return '';
  return beat.type === 'stage_direction' ? (beat.action || '') : (beat.line || '');
}

function lastWordsNoPunctuation(text, n) {
  if (!text) return '';
  const cleaned = text.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const words = cleaned.split(' ');
  return words.slice(-n).join(' ');
}

function isUserSpeaker(beat) {
  if (!state.characters.length || !beat) return false;
  if (beat.type === 'stage_direction') return false;
  return asArray(beat.speaker).some(s => state.characters.includes(s));
}

async function loadCatalog(collection = null) {
  const res = await fetch(`${API}?action=list&mode=${encodeURIComponent(state.mode)}`);
  if (!res.ok) {
    alert('Impossibile caricare i copioni. Riprova più tardi.');
    state.catalog = [];
  } else {
    state.catalog = await res.json();
  }
  state.collection = collection;
  renderCatalog();
}

function syncScriptsModeToggle() {
  document.querySelectorAll('#scripts-mode-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === state.mode);
  });
}

function forkSubtree(rows, root) {
  const out = [];
  (function visit(row, depth) {
    out.push({ row, depth });
    rows
      .filter(r => r.parent_id === row.id)
      .forEach(child => visit(child, depth + 1));
  })(root, 0);
  return out;
}

function renderCatalog() {
  const inFolder = !!state.collection;
  document.querySelector('#view-scripts .hero').classList.toggle('hidden', inFolder);
  document.getElementById('scripts-top-bar').classList.toggle('hidden', !inFolder);
  document.getElementById('editor-link').classList.toggle('hidden', inFolder);

  const rows = state.catalog;
  const roots = rows.filter(r => r.parent_id === null);

  const list = document.getElementById('script-list');
  list.innerHTML = '';

  function familyOf(root) {
    return rows.filter(r => r.id === root.id || r.root_id === root.id);
  }

  function appendScript(root) {
    const versions = familyOf(root).length;
    const li = document.createElement('li');
    const btn = document.createElement('button');
    const title = document.createElement('div');
    title.className = 'script-title';
    title.textContent = root.title;
    btn.appendChild(title);
    const metaParts = [`${root.actors} personaggi`, `${root.scenes} scene`];
    if (versions > 1) metaParts.push(`${versions} versioni`);
    if (root.author) metaParts.push(`di ${root.author}`);
    const meta = document.createElement('div');
    meta.className = 'script-meta';
    meta.textContent = metaParts.join(' · ');
    btn.appendChild(meta);
    btn.addEventListener('click', () => openEntry(root));
    li.appendChild(btn);
    list.appendChild(li);
  }

  function appendFolder(name) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.classList.add('folder-entry');
    const title = document.createElement('div');
    title.className = 'script-title';
    title.textContent = name;
    btn.appendChild(title);
    const meta = document.createElement('div');
    meta.className = 'script-meta';
    meta.textContent = 'Cartella';
    btn.appendChild(meta);
    btn.addEventListener('click', () => enterCollection(name));
    li.appendChild(btn);
    list.appendChild(li);
  }

  if (!inFolder) {
    const collections = [...new Set(roots.filter(r => r.collection).map(r => r.collection))];
    collections.forEach(appendFolder);
    roots.filter(r => !r.collection).forEach(appendScript);
  } else {
    roots.filter(r => r.collection === state.collection).forEach(appendScript);
  }
}

function openEntry(root) {
  const family = state.catalog.filter(r => r.id === root.id || r.root_id === root.id);
  if (family.length <= 1) {
    loadScript(root.id);
    return;
  }
  pushNav({ view: 'versions', id: root.id });
  renderVersions(root);
  showView('versions');
}

function renderVersions(root) {
  document.getElementById('versions-title').textContent = root.title;
  const list = document.getElementById('version-list');
  list.innerHTML = '';
  const family = state.catalog.filter(r => r.id === root.id || r.root_id === root.id);
  forkSubtree(family, root).forEach(({ row, depth }) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    if (depth > 0) btn.style.marginLeft = `${Math.min(depth, 4) * 1.1}rem`;
    const title = document.createElement('div');
    title.className = 'script-title';
    title.textContent = (depth > 0 ? '↳ ' : '') + row.title;
    btn.appendChild(title);
    const metaParts = [];
    metaParts.push(depth === 0 ? 'Originale' : (row.fork_note || 'Variante'));
    metaParts.push(`${row.actors} personaggi · ${row.scenes} scene`);
    if (row.author) metaParts.push(`di ${row.author}`);
    const meta = document.createElement('div');
    meta.className = 'script-meta';
    meta.textContent = metaParts.join(' · ');
    btn.appendChild(meta);
    btn.addEventListener('click', () => loadScript(row.id));
    li.appendChild(btn);
    list.appendChild(li);
  });
}

function pushNav(s) {
  if (state.suppressNav) return;
  history.pushState(s, '');
}

function replaceNav(s) {
  if (state.suppressNav) return;
  history.replaceState(s, '');
}

async function restoreView(s) {
  if (!s) s = { view: 'scripts', collection: null };
  state.suppressNav = true;
  try {
    if (s.view === 'scripts') {
      const target = s.collection || null;
      if (state.collection !== target || !state.catalog.length) {
        await loadCatalog(target);
      }
      showView('scripts');
    } else if (s.view === 'versions') {
      if (!state.catalog.length) await loadCatalog(state.collection);
      const root = state.catalog.find(r => r.id === s.id);
      if (!root) {
        await loadCatalog(null);
        showView('scripts');
        return;
      }
      renderVersions(root);
      showView('versions');
    } else if (['characters', 'prep', 'playback', 'readall'].includes(s.view)) {
      if (!state.script && s.id) await fetchScript(s.id);
      if (!state.script) {
        await loadCatalog(null);
        showView('scripts');
        return;
      }
      if (s.view === 'characters') showCharacterPicker(state.script);
      showView(s.view);
    }
  } finally {
    state.suppressNav = false;
  }
}

function enterCollection(name) {
  pushNav({ view: 'scripts', collection: name });
  state.collection = name;
  renderCatalog();
}

async function fetchScript(id) {
  const res = await fetch(`${API}?action=get&id=${id}`);
  if (!res.ok) return;
  const data = await res.json();
  state.script = data.content;
  // title/language live in the row columns, not in the content document:
  // merge them back so the rest of the app reads one self-contained object.
  if (state.script && typeof state.script === 'object') {
    if (!state.script.title) state.script.title = data.title;
    if (!state.script.language) state.script.language = data.language;
  }
  state.scriptMeta = data;
}

async function loadScript(id) {
  await fetchScript(id);
  if (!state.script) {
    alert('Impossibile caricare il copione.');
    return;
  }
  pushNav({ view: 'characters', id });
  showCharacterPicker(state.script);
}

function showCharacterPicker(script) {
  document.getElementById('char-script-title').textContent = script.title;
  const descEl = document.getElementById('char-script-description');
  if (script.description) {
    descEl.textContent = script.description;
    descEl.classList.remove('hidden');
  } else {
    descEl.classList.add('hidden');
  }

  const selected = new Set();
  const startBtn = document.getElementById('start-playback-btn');
  function refreshStart() {
    startBtn.disabled = selected.size === 0;
    startBtn.textContent = selected.size === 0
      ? 'Inizia'
      : `Inizia (${selected.size})`;
  }

  const list = document.getElementById('character-list');
  list.innerHTML = '';
  script.characters.forEach(char => {
    const color = characterColor(char.name);
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'character-pick';
    btn.style.setProperty('--char-color', color);

    const swatch = document.createElement('span');
    swatch.className = 'char-swatch';
    btn.appendChild(swatch);

    const body = document.createElement('div');
    body.className = 'char-body';
    const name = document.createElement('div');
    name.className = 'script-title';
    name.textContent = char.name;
    body.appendChild(name);
    if (char.description) {
      const desc = document.createElement('div');
      desc.className = 'char-description';
      desc.textContent = char.description;
      body.appendChild(desc);
    }
    btn.appendChild(body);

    btn.addEventListener('click', () => {
      if (selected.has(char.name)) {
        selected.delete(char.name);
        btn.classList.remove('selected');
      } else {
        selected.add(char.name);
        btn.classList.add('selected');
      }
      refreshStart();
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
  if (!isImprovScript()) {
    const liRead = document.createElement('li');
    const btnRead = document.createElement('button');
    btnRead.className = 'subtle';
    btnRead.textContent = 'Solo lettura (nessun personaggio)';
    btnRead.addEventListener('click', () => startPlayback([]));
    liRead.appendChild(btnRead);
    list.appendChild(liRead);
  }

  startBtn.onclick = () => {
    if (!selected.size) return;
    const ordered = script.characters
      .map(c => c.name)
      .filter(n => selected.has(n));
    startPlayback(ordered);
  };
  refreshStart();

  showView('characters');
}

function startPlayback(characters) {
  state.characters = Array.isArray(characters) ? characters : [];
  state.sceneIdx = 0;
  state.beatIdx = 0;
  let view;
  if (state.characters.length === 0) view = 'readall';
  else if (isImprovScript()) view = 'prep';
  else view = 'playback';
  const navId = state.scriptMeta ? state.scriptMeta.id : undefined;
  if (history.state && history.state.view !== view) pushNav({ view, id: navId });
  if (view === 'readall') {
    renderReadAll();
    showView('readall');
  } else if (view === 'prep') {
    renderPrep();
    showView('prep');
  } else {
    showView('playback');
    render();
  }
}

function beginImprovPlayback() {
  const navId = state.scriptMeta ? state.scriptMeta.id : undefined;
  if (history.state && history.state.view !== 'playback') pushNav({ view: 'playback', id: navId });
  showView('playback');
  render();
}

function renderReadAll() {
  document.getElementById('readall-title').textContent = state.script.title;
  const container = document.getElementById('readall-content');
  container.innerHTML = '';
  state.script.scenes.forEach(scene => {
    const banner = document.createElement('div');
    banner.className = 'scene-banner';
    const t = document.createElement('div'); t.className = 'title'; t.textContent = scene.title;
    banner.appendChild(t);
    if (scene.setting) {
      const r = document.createElement('div'); r.className = 'row';
      const lab = document.createElement('span'); lab.className = 'label'; lab.textContent = 'Ambientazione: ';
      r.appendChild(lab); r.appendChild(document.createTextNode(scene.setting));
      banner.appendChild(r);
    }
    if (scene.music) {
      const r = document.createElement('div'); r.className = 'row';
      const lab = document.createElement('span'); lab.className = 'label'; lab.textContent = 'Musica: ';
      r.appendChild(lab); r.appendChild(document.createTextNode(scene.music));
      banner.appendChild(r);
    }
    container.appendChild(banner);

    scene.beats.forEach(beat => {
      const row = document.createElement('div');
      row.className = 'readall-beat';
      if (beat.type === 'stage_direction') {
        row.classList.add('stage-direction');
        const action = document.createElement('div');
        action.className = 'action';
        action.textContent = beat.action || '';
        row.appendChild(action);
      } else {
        const head = document.createElement('div');
        head.className = 'speaker';
        head.textContent = `${asArray(beat.speaker).join(' & ')} → ${asArray(beat.to).join(' & ')}`;
        const line = document.createElement('div');
        line.className = 'line';
        line.textContent = beat.line || '';
        row.appendChild(head);
        row.appendChild(line);
      }
      container.appendChild(row);
    });
  });
  window.scrollTo(0, 0);
}

function renderSpeakerHeader(beat, headerEl) {
  const tos = asArray(beat.to).join(' & ');
  headerEl.innerHTML = '';
  asArray(beat.speaker).forEach((name, i) => {
    if (i > 0) headerEl.appendChild(document.createTextNode(' & '));
    const span = document.createElement('span');
    span.textContent = name;
    if (state.characters.includes(name)) {
      span.className = 'speaker-name';
      span.style.color = characterColor(name);
    }
    headerEl.appendChild(span);
  });
  headerEl.appendChild(document.createTextNode(` → ${tos}`));
}

function renderPrep() {
  const p = state.script.preparation || {};
  document.getElementById('prep-title').textContent = state.script.title;
  const container = document.getElementById('prep-content');
  container.innerHTML = '';

  if (state.script.description) {
    const d = document.createElement('p');
    d.className = 'prep-description';
    d.textContent = state.script.description;
    container.appendChild(d);
  }

  const meta = [
    ['Premessa', p.premise],
    ['Tono', p.tone],
    ['Finale da preservare', p.ending_to_preserve],
  ];
  meta.forEach(([label, val]) => {
    if (!val) return;
    container.appendChild(prepBox(label, val));
  });

  if (Array.isArray(p.continuity_rules) && p.continuity_rules.length) {
    container.appendChild(prepListBox('Regole di continuità', p.continuity_rules));
  }

  if (Array.isArray(p.background) && p.background.length) {
    const box = document.createElement('div');
    box.className = 'prep-box';
    const lab = document.createElement('div');
    lab.className = 'prep-label';
    lab.textContent = 'Ripasso';
    box.appendChild(lab);
    p.background.forEach(item => {
      const entry = document.createElement('div');
      entry.className = 'prep-bg-entry';
      const t = document.createElement('div');
      t.className = 'prep-bg-title';
      t.textContent = item.title || '';
      const d = document.createElement('div');
      d.className = 'prep-bg-desc';
      d.textContent = item.description || '';
      entry.appendChild(t);
      entry.appendChild(d);
      box.appendChild(entry);
    });
    container.appendChild(box);
  }

  if (Array.isArray(p.scene_flow) && p.scene_flow.length) {
    const box = document.createElement('div');
    box.className = 'prep-box';
    const lab = document.createElement('div');
    lab.className = 'prep-label';
    lab.textContent = 'Struttura delle scene';
    box.appendChild(lab);
    const ol = document.createElement('ol');
    ol.className = 'prep-list';
    p.scene_flow.forEach(sf => {
      const li = document.createElement('li');
      const scene = state.script.scenes.find(s => s.id === sf.scene);
      const title = scene ? scene.title : sf.scene;
      const strong = document.createElement('strong');
      strong.textContent = title;
      li.appendChild(strong);
      li.appendChild(document.createTextNode(` — ${sf.summary}`));
      ol.appendChild(li);
    });
    box.appendChild(ol);
    container.appendChild(box);
  }

  const chBox = document.createElement('div');
  chBox.className = 'prep-box';
  const chLab = document.createElement('div');
  chLab.className = 'prep-label';
  chLab.textContent = 'Personaggi';
  chBox.appendChild(chLab);
  state.script.characters.forEach(c => {
    const row = document.createElement('div');
    row.className = 'prep-character';
    row.style.setProperty('--char-color', characterColor(c.name));
    if (state.characters.includes(c.name)) row.classList.add('mine');
    const nm = document.createElement('div');
    nm.className = 'prep-char-name';
    nm.textContent = c.name;
    row.appendChild(nm);
    if (c.description) {
      const d = document.createElement('div');
      d.className = 'prep-char-desc';
      d.textContent = c.description;
      row.appendChild(d);
    }
    if (c.never_do) {
      const nd = document.createElement('div');
      nd.className = 'prep-char-never';
      const strong = document.createElement('strong');
      strong.textContent = 'Da non fare: ';
      nd.appendChild(strong);
      nd.appendChild(document.createTextNode(c.never_do));
      row.appendChild(nd);
    }
    chBox.appendChild(row);
  });
  container.appendChild(chBox);

  window.scrollTo(0, 0);
}

function prepBox(label, val) {
  const box = document.createElement('div');
  box.className = 'prep-box';
  const lab = document.createElement('div');
  lab.className = 'prep-label';
  lab.textContent = label;
  const body = document.createElement('div');
  body.className = 'prep-body';
  body.textContent = val;
  box.appendChild(lab);
  box.appendChild(body);
  return box;
}

function prepListBox(label, items) {
  const box = document.createElement('div');
  box.className = 'prep-box';
  const lab = document.createElement('div');
  lab.className = 'prep-label';
  lab.textContent = label;
  box.appendChild(lab);
  const ul = document.createElement('ul');
  ul.className = 'prep-list';
  items.forEach(it => {
    const li = document.createElement('li');
    li.textContent = it;
    ul.appendChild(li);
  });
  box.appendChild(ul);
  return box;
}

function openInfoSheet(kind) {
  const p = (state.script && state.script.preparation) || {};
  const sheet = document.getElementById('info-sheet');
  const title = document.getElementById('info-sheet-title');
  const body = document.getElementById('info-sheet-body');
  body.innerHTML = '';
  if (kind === 'continuity') {
    title.textContent = 'Regole di continuità';
    const ul = document.createElement('ul');
    ul.className = 'prep-list';
    (p.continuity_rules || []).forEach(r => {
      const li = document.createElement('li');
      li.textContent = r;
      ul.appendChild(li);
    });
    body.appendChild(ul);
  } else {
    title.textContent = 'Ripasso';
    (p.background || []).forEach(item => {
      const entry = document.createElement('div');
      entry.className = 'prep-bg-entry';
      const t = document.createElement('div');
      t.className = 'prep-bg-title';
      t.textContent = item.title || '';
      const d = document.createElement('div');
      d.className = 'prep-bg-desc';
      d.textContent = item.description || '';
      entry.appendChild(t);
      entry.appendChild(d);
      body.appendChild(entry);
    });
  }
  sheet.dataset.kind = kind;
  sheet.classList.remove('hidden');
  document.querySelectorAll('#improv-fabs .fab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.panel === kind);
  });
}

function closeInfoSheet() {
  document.getElementById('info-sheet').classList.add('hidden');
  document.querySelectorAll('#improv-fabs .fab-btn').forEach(b => b.classList.remove('active'));
}

function toggleInfoSheet(kind) {
  const sheet = document.getElementById('info-sheet');
  if (!sheet.classList.contains('hidden') && sheet.dataset.kind === kind) {
    closeInfoSheet();
  } else {
    openInfoSheet(kind);
  }
}

function render() {
  const scene = currentScene();
  const beat = currentBeat();
  const improv = isImprovScript();
  const card = document.getElementById('beat-card');
  const banner = document.getElementById('scene-banner');
  const headerEl = document.getElementById('beat-header');
  const lineEl = document.getElementById('beat-line');
  const contextEl = document.getElementById('beat-context');
  const upNext = document.getElementById('up-next');

  if (state.beatIdx === 0) {
    document.getElementById('scene-title').textContent = scene.title;
    document.getElementById('scene-setting').textContent = scene.setting || '';
    const musicRow = document.getElementById('scene-music-row');
    if (scene.music) {
      document.getElementById('scene-music').textContent = scene.music;
      musicRow.classList.remove('hidden');
    } else {
      musicRow.classList.add('hidden');
    }
    const prepRow = document.getElementById('scene-prep-row');
    if (scene.scene_prep) {
      document.getElementById('scene-prep').textContent = scene.scene_prep;
      prepRow.classList.remove('hidden');
    } else {
      prepRow.classList.add('hidden');
    }
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }

  card.classList.remove('mine', 'stage-direction', 'improv');
  if (improv) card.classList.add('improv');

  const fabs = document.getElementById('improv-fabs');
  const p = (state.script && state.script.preparation) || {};
  const hasContinuity = Array.isArray(p.continuity_rules) && p.continuity_rules.length > 0;
  const hasBackground = Array.isArray(p.background) && p.background.length > 0;
  fabs.classList.toggle('hidden', !improv || (!hasContinuity && !hasBackground));
  fabs.querySelector('[data-panel="continuity"]').classList.toggle('hidden', !hasContinuity);
  fabs.querySelector('[data-panel="background"]').classList.toggle('hidden', !hasBackground);

  if (beat.type === 'stage_direction') {
    card.classList.add('stage-direction');
    headerEl.textContent = 'Indicazione scenica';
    lineEl.textContent = beat.action || '';
    lineEl.classList.remove('hidden');
    contextEl.textContent = beat.context || '';
  } else {
    const mine = isUserSpeaker(beat);
    renderSpeakerHeader(beat, headerEl);
    if (mine) card.classList.add('mine');
    if (improv) {
      lineEl.textContent = beat.context || '';
      lineEl.classList.remove('hidden');
      contextEl.textContent = beat.constraint ? `Vincolo: ${beat.constraint}` : '';
    } else {
      lineEl.textContent = beat.line || '';
      lineEl.classList.remove('hidden');
      const cue = lastWordsNoPunctuation(beatText(prevBeat()), 4);
      contextEl.textContent = cue ? `… ${cue}` : '';
    }
  }

  const nb = nextBeat();
  upNext.classList.toggle('hidden', !(nb && isUserSpeaker(nb.beat)));

  const atStart = state.sceneIdx === 0 && state.beatIdx === 0;
  document.getElementById('back-btn-beat').disabled = atStart;
  document.getElementById('skip-btn-user').disabled = !hasNextUserBeat();
}

function advance() {
  const scene = currentScene();
  if (state.beatIdx + 1 < scene.beats.length) {
    state.beatIdx++;
  } else if (state.sceneIdx + 1 < state.script.scenes.length) {
    state.sceneIdx++;
    state.beatIdx = 0;
  } else {
    showView('end');
    return;
  }
  render();
}

function goBack() {
  if (state.beatIdx > 0) {
    state.beatIdx--;
  } else if (state.sceneIdx > 0) {
    state.sceneIdx--;
    state.beatIdx = state.script.scenes[state.sceneIdx].beats.length - 1;
  } else {
    return;
  }
  render();
}

function skipToNextUserBeat() {
  let s = state.sceneIdx, b = state.beatIdx + 1;
  while (s < state.script.scenes.length) {
    const scene = state.script.scenes[s];
    while (b < scene.beats.length) {
      if (isUserSpeaker(scene.beats[b])) {
        state.sceneIdx = s; state.beatIdx = b;
        render();
        return;
      }
      b++;
    }
    s++; b = 0;
  }
}

function hasNextUserBeat() {
  let s = state.sceneIdx, b = state.beatIdx + 1;
  while (s < state.script.scenes.length) {
    const scene = state.script.scenes[s];
    while (b < scene.beats.length) {
      if (isUserSpeaker(scene.beats[b])) return true;
      b++;
    }
    s++; b = 0;
  }
  return false;
}

document.getElementById('back-to-scripts').addEventListener('click', () => {
  if (state.previewMode) { window.location.href = './editor.html'; return; }
  history.back();
});
document.getElementById('folder-back-btn').addEventListener('click', () => history.back());
document.getElementById('back-from-versions').addEventListener('click', () => history.back());
document.getElementById('back-to-characters').addEventListener('click', () => history.back());
document.getElementById('back-from-readall').addEventListener('click', () => history.back());
document.getElementById('advance-btn').addEventListener('click', advance);
document.getElementById('back-btn-beat').addEventListener('click', goBack);
document.getElementById('skip-btn-user').addEventListener('click', skipToNextUserBeat);
document.getElementById('back-from-prep').addEventListener('click', () => history.back());
document.getElementById('start-improv-btn').addEventListener('click', beginImprovPlayback);
document.getElementById('improv-fabs').addEventListener('click', e => {
  const btn = e.target.closest('button[data-panel]');
  if (!btn) return;
  toggleInfoSheet(btn.dataset.panel);
});
document.getElementById('info-sheet-close').addEventListener('click', closeInfoSheet);
document.getElementById('scripts-mode-toggle').addEventListener('click', e => {
  const btn = e.target.closest('button[data-mode]');
  if (!btn) return;
  const newMode = btn.dataset.mode;
  if (newMode === state.mode) return;
  state.mode = newMode;
  localStorage.setItem(MODE_KEY, newMode);
  syncScriptsModeToggle();
  loadCatalog(null).then(() => {
    replaceNav({ view: 'scripts', collection: null });
  });
});
document.getElementById('restart-btn').addEventListener('click', () => {
  startPlayback(state.characters);
});

window.addEventListener('popstate', e => restoreView(e.state));

(function bootstrap() {
  const savedMode = localStorage.getItem(MODE_KEY);
  if (savedMode === 'lettura' || savedMode === 'improv') state.mode = savedMode;
  syncScriptsModeToggle();

  const params = new URLSearchParams(location.search);
  if (params.get('preview') === '1') {
    const raw = localStorage.getItem('ribalta:preview');
    if (!raw) {
      alert('Nessuna anteprima trovata. Torna all’editor.');
      window.location.href = './editor.html';
      return;
    }
    state.previewMode = true;
    state.script = JSON.parse(raw);
    document.getElementById('back-to-scripts').textContent = '← Torna all’editor';
    replaceNav({ view: 'characters' });
    showCharacterPicker(state.script);
  } else {
    replaceNav({ view: 'scripts', collection: null });
    loadCatalog(null);
  }
})();
