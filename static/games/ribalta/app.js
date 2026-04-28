const state = {
  manifest: [],
  script: null,
  character: null,
  sceneIdx: 0,
  beatIdx: 0,
  mode: 'read',
};

const views = {
  scripts: document.getElementById('view-scripts'),
  characters: document.getElementById('view-characters'),
  playback: document.getElementById('view-playback'),
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

function isUserSpeaker(beat) {
  if (!state.character || !beat || beat.type !== 'line') return false;
  return asArray(beat.speaker).includes(state.character);
}

async function loadManifest() {
  const res = await fetch('./scripts/index.json');
  state.manifest = await res.json();
  const list = document.getElementById('script-list');
  list.innerHTML = '';
  state.manifest.forEach(entry => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    const title = document.createElement('div');
    title.className = 'script-title';
    title.textContent = entry.title;
    btn.appendChild(title);
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
    li.appendChild(btn);
    list.appendChild(li);
  });
}

async function loadScript(entry) {
  const res = await fetch(`./scripts/${entry.file}`);
  state.script = await res.json();
  document.getElementById('char-script-title').textContent = state.script.title;
  const descEl = document.getElementById('char-script-description');
  if (state.script.description) {
    descEl.textContent = state.script.description;
    descEl.classList.remove('hidden');
  } else {
    descEl.classList.add('hidden');
  }

  const list = document.getElementById('character-list');
  list.innerHTML = '';
  state.script.characters.forEach(name => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.addEventListener('click', () => startPlayback(name));
    li.appendChild(btn);
    list.appendChild(li);
  });
  const liRead = document.createElement('li');
  const btnRead = document.createElement('button');
  btnRead.className = 'subtle';
  btnRead.textContent = 'Solo lettura (nessun personaggio)';
  btnRead.addEventListener('click', () => startPlayback(null));
  liRead.appendChild(btnRead);
  list.appendChild(liRead);

  showView('characters');
}

function startPlayback(character) {
  state.character = character;
  state.sceneIdx = 0;
  state.beatIdx = 0;
  state.mode = 'read';
  syncModeToggle();
  showView('playback');
  render();
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
      const tag = document.createElement('span');
      tag.className = 'mine-tag';
      tag.textContent = 'La tua battuta';
      headerEl.appendChild(tag);
      card.classList.add('mine');
    }
    contextEl.textContent = beat.context || '';

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

document.getElementById('back-to-scripts').addEventListener('click', () => showView('scripts'));
document.getElementById('back-to-characters').addEventListener('click', () => showView('characters'));
document.getElementById('advance-btn').addEventListener('click', advance);
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
  startPlayback(state.character);
});

loadManifest();
