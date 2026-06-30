const state = {
  manifest: [],
  currentPath: '',
  folderStack: [],
  script: null,
  characters: [],
  sceneIdx: 0,
  beatIdx: 0,
  mode: 'read',
  previewMode: false,
};

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
  characters: document.getElementById('view-characters'),
  playback: document.getElementById('view-playback'),
  readall: document.getElementById('view-readall'),
  end: document.getElementById('view-end'),
};

function showView(name) {
  Object.entries(views).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
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
  if (!state.characters.length || !beat || beat.type !== 'line') return false;
  return asArray(beat.speaker).some(s => state.characters.includes(s));
}

function userSpeakersIn(beat) {
  if (!beat || beat.type !== 'line') return [];
  return asArray(beat.speaker).filter(s => state.characters.includes(s));
}

async function loadManifest(path = '') {
  const res = await fetch(`./scripts/${path}index.json`);
  state.manifest = await res.json();
  state.currentPath = path;
  renderManifestList();
}

function renderManifestList() {
  const inFolder = state.folderStack.length > 0;
  document.querySelector('#view-scripts .hero').classList.toggle('hidden', inFolder);
  document.getElementById('scripts-top-bar').classList.toggle('hidden', !inFolder);
  document.getElementById('editor-link').classList.toggle('hidden', inFolder);

  const list = document.getElementById('script-list');
  list.innerHTML = '';
  state.manifest.forEach(entry => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    const title = document.createElement('div');
    title.className = 'script-title';
    title.textContent = entry.title;
    btn.appendChild(title);
    if (entry.folder) {
      btn.classList.add('folder-entry');
      const meta = document.createElement('div');
      meta.className = 'script-meta';
      meta.textContent = 'Cartella';
      btn.appendChild(meta);
      btn.addEventListener('click', () => enterFolder(entry));
    } else {
      const metaParts = [];
      if (entry.actors != null) metaParts.push(`${entry.actors} personaggi`);
      if (entry.scenes != null) metaParts.push(`${entry.scenes} scene`);
      if (metaParts.length) {
        const meta = document.createElement('div');
        meta.className = 'script-meta';
        meta.textContent = metaParts.join(' · ');
        btn.appendChild(meta);
      }
      btn.addEventListener('click', () => loadScript(entry));
    }
    li.appendChild(btn);
    list.appendChild(li);
  });
}

function enterFolder(entry) {
  state.folderStack.push(state.currentPath);
  loadManifest(state.currentPath + entry.folder + '/');
}

function exitFolder() {
  const prev = state.folderStack.pop();
  loadManifest(prev || '');
}

async function loadScript(entry) {
  const res = await fetch(`./scripts/${state.currentPath}${entry.file}`);
  state.script = await res.json();
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
  const liRead = document.createElement('li');
  const btnRead = document.createElement('button');
  btnRead.className = 'subtle';
  btnRead.textContent = 'Solo lettura (nessun personaggio)';
  btnRead.addEventListener('click', () => startPlayback([]));
  liRead.appendChild(btnRead);
  list.appendChild(liRead);

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
  state.mode = 'read';
  if (state.characters.length === 0) {
    renderReadAll();
    showView('readall');
  } else {
    syncModeToggle();
    showView('playback');
    render();
  }
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

function syncModeToggle() {
  document.querySelectorAll('#mode-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === state.mode);
  });
}

function render() {
  const scene = currentScene();
  const beat = currentBeat();
  const card = document.getElementById('beat-card');
  const banner = document.getElementById('scene-banner');
  const headerEl = document.getElementById('beat-header');
  const lineEl = document.getElementById('beat-line');
  const contextEl = document.getElementById('beat-context');
  const peekBtn = document.getElementById('peek-btn');
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
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }

  card.classList.remove('mine', 'stage-direction');
  peekBtn.classList.add('hidden');

  if (beat.type === 'stage_direction') {
    card.classList.add('stage-direction');
    headerEl.textContent = 'Indicazione scenica';
    lineEl.textContent = beat.action || '';
    contextEl.textContent = beat.context || '';
  } else {
    const mine = isUserSpeaker(beat);
    const speakers = asArray(beat.speaker).join(' & ');
    const tos = asArray(beat.to).join(' & ');
    headerEl.innerHTML = '';
    headerEl.appendChild(document.createTextNode(`${speakers} → ${tos}`));
    if (mine) {
      userSpeakersIn(beat).forEach(name => {
        const tag = document.createElement('span');
        tag.className = 'mine-tag';
        tag.style.background = characterColor(name);
        tag.textContent = name;
        headerEl.appendChild(tag);
      });
      card.classList.add('mine');
    }
    if (state.mode === 'read') {
      const cue = lastWordsNoPunctuation(beatText(prevBeat()), 4);
      contextEl.textContent = cue ? `… ${cue}` : '';
    } else {
      contextEl.textContent = beat.context || '';
    }

    if (mine && state.mode === 'improv') {
      lineEl.textContent = '';
      lineEl.classList.add('hidden');
      peekBtn.classList.remove('hidden');
    } else {
      lineEl.textContent = beat.line || '';
      lineEl.classList.remove('hidden');
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
  showView('scripts');
});
document.getElementById('folder-back-btn').addEventListener('click', exitFolder);
document.getElementById('back-to-characters').addEventListener('click', () => showView('characters'));
document.getElementById('back-from-readall').addEventListener('click', () => showView('characters'));
document.getElementById('advance-btn').addEventListener('click', advance);
document.getElementById('back-btn-beat').addEventListener('click', goBack);
document.getElementById('skip-btn-user').addEventListener('click', skipToNextUserBeat);
document.getElementById('peek-btn').addEventListener('click', () => {
  const beat = currentBeat();
  const lineEl = document.getElementById('beat-line');
  lineEl.textContent = beat.line || '';
  lineEl.classList.remove('hidden');
  document.getElementById('peek-btn').classList.add('hidden');
});
document.getElementById('mode-toggle').addEventListener('click', e => {
  const btn = e.target.closest('button[data-mode]');
  if (!btn) return;
  state.mode = btn.dataset.mode;
  syncModeToggle();
  render();
});
document.getElementById('restart-btn').addEventListener('click', () => {
  startPlayback(state.characters);
});

(function bootstrap() {
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
    showCharacterPicker(state.script);
  } else {
    loadManifest();
  }
})();
