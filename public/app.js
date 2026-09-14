// BandList frontend — plain JS, no framework. State lives in memory and is
// re-fetched from the API whenever something changes; there's no client-side
// cache to keep in sync, which keeps this simple to reason about.

const state = {
  members: [],
  currentMember: null, // { id, name } from GET /api/auth/me - the source of truth for "who am I"
  statusFilter: 'proposed',
  activeSongId: null,
};

// ---------- API helpers ----------

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    // Session expired or was never there - drop back to the login screen
    // rather than letting every caller handle this individually.
    showAuthScreen();
    throw new Error('please log in');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const getSongs = (status) => api(`/songs${status && status !== 'all' ? `?status=${status}` : ''}`);
const getSong = (id) => api(`/songs/${id}`);
const createSong = (data) => api('/songs', { method: 'POST', body: JSON.stringify(data) });
const patchSong = (id, data) => api(`/songs/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
const getMembers = () => api('/members');
const castVote = (song_id, score) =>
  api('/votes', { method: 'POST', body: JSON.stringify({ song_id, score }) });

// ---------- Auth ----------

async function fetchCurrentMember() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function showAuthScreen() {
  document.getElementById('auth-screen').classList.add('visible');
  document.getElementById('app-shell').classList.remove('visible');
  state.currentMember = null;
}

function showAppShell(member) {
  state.currentMember = member;
  document.getElementById('auth-screen').classList.remove('visible');
  document.getElementById('app-shell').classList.add('visible');
  document.getElementById('whoami-name').textContent = member.name;
}

let authMode = 'login';
document.querySelectorAll('.auth-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    authMode = tab.dataset.mode;
    document.querySelectorAll('.auth-tab').forEach((t) => t.classList.toggle('active', t === tab));
    document.getElementById('auth-submit').textContent = authMode === 'login' ? 'Log in' : 'Sign up';
    document.getElementById('auth-password').autocomplete = authMode === 'login' ? 'current-password' : 'new-password';
    document.getElementById('auth-hint').style.display = authMode === 'signup' ? 'block' : 'none';
    document.getElementById('auth-msg').textContent = '';
  });
});

document.getElementById('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const msg = document.getElementById('auth-msg');
  const name = form.name.value.trim();
  const password = form.password.value;

  try {
    const res = await fetch(`/api/auth/${authMode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'something went wrong');

    form.reset();
    msg.textContent = '';
    await loadMembers();
    showAppShell(body);
    await renderRankings();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'form-msg err';
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  showAuthScreen();
});

// ---------- Tabs ----------

document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  showView(btn.dataset.view);
});

function showView(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  if (name === 'rank') renderRankings();
  if (name === 'learned') renderLearned();
  if (name === 'members') renderMembers();
}

// ---------- Member roster (used by the Members tab, not for identity - see Auth) ----------

async function loadMembers() {
  state.members = await getMembers();
}

// ---------- Rankings view ----------

document.getElementById('status-filter').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('#status-filter .chip').forEach((c) => c.classList.toggle('active', c === chip));
  state.statusFilter = chip.dataset.status;
  renderRankings();
});

function specChips(song) {
  const chips = [];
  if (song.song_key) chips.push(song.song_key);
  if (song.time_signature) chips.push(song.time_signature);
  if (song.tempo_bpm) chips.push(`${song.tempo_bpm} bpm`);
  return chips.map((c) => `<span class="spec-chip">${escapeHtml(c)}</span>`).join('');
}

function scoreBlock(song) {
  if (song.vote_count === 0) {
    return `<div class="score-block"><div class="score-value no-votes">no votes</div></div>`;
  }
  return `
    <div class="score-block">
      <div class="score-value">${song.avg_score}</div>
      <div class="score-count">${song.vote_count} vote${song.vote_count === 1 ? '' : 's'}</div>
    </div>`;
}

async function renderRankings() {
  const container = document.getElementById('song-list');
  container.innerHTML = '<div class="empty-state">loading...</div>';

  const status = state.statusFilter === 'all' ? null : state.statusFilter;
  // "all active" still excludes learned/shelved songs from the queue view
  const songs = state.statusFilter === 'all'
    ? (await getSongs()).filter((s) => s.status === 'proposed' || s.status === 'learning')
    : await getSongs(status);

  if (songs.length === 0) {
    container.innerHTML = '<div class="empty-state">nothing here yet. submit a song to get the voting started.</div>';
    return;
  }

  container.innerHTML = songs.map((song, i) => `
    <div class="song-row" data-id="${song.id}">
      <div class="rank-num">${i + 1}</div>
      <div class="song-info">
        <p class="title">${escapeHtml(song.title)}</p>
        ${song.artist ? `<p class="artist">${escapeHtml(song.artist)}</p>` : ''}
        <div class="song-specs">
          <span class="status-pill ${song.status}">${song.status}</span>
          ${specChips(song)}
        </div>
      </div>
      ${scoreBlock(song)}
    </div>
  `).join('');

  container.querySelectorAll('.song-row').forEach((row) => {
    row.addEventListener('click', () => openSongModal(Number(row.dataset.id)));
  });
}

// ---------- Learned view ----------

async function renderLearned() {
  const container = document.getElementById('learned-list');
  container.innerHTML = '<div class="empty-state">loading...</div>';

  const songs = (await getSongs('learned')).sort((a, b) =>
    new Date(b.date_learned || 0) - new Date(a.date_learned || 0));

  if (songs.length === 0) {
    container.innerHTML = '<div class="empty-state">nothing learned yet. get voting.</div>';
    return;
  }

  container.innerHTML = songs.map((song) => `
    <div class="song-row" data-id="${song.id}">
      <div class="rank-num" style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">
        ${song.date_learned ? new Date(song.date_learned).toLocaleDateString() : '—'}
      </div>
      <div class="song-info">
        <p class="title">${escapeHtml(song.title)}</p>
        ${song.artist ? `<p class="artist">${escapeHtml(song.artist)}</p>` : ''}
        <div class="song-specs">${specChips(song)}</div>
      </div>
      ${scoreBlock(song)}
    </div>
  `).join('');

  container.querySelectorAll('.song-row').forEach((row) => {
    row.addEventListener('click', () => openSongModal(Number(row.dataset.id)));
  });
}

// ---------- Add song ----------

document.getElementById('add-song-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const msg = document.getElementById('add-song-msg');
  const data = {
    title: form.title.value.trim(),
    artist: form.artist.value.trim() || null,
    song_key: form.song_key.value.trim() || null,
    time_signature: form.time_signature.value.trim() || null,
    tempo_bpm: form.tempo_bpm.value ? Number(form.tempo_bpm.value) : null,
    notes: form.notes.value.trim() || null,
    // submitted_by is not sent - the server attributes it to the logged-in session
  };

  try {
    await createSong(data);
    msg.textContent = `"${data.title}" submitted.`;
    msg.className = 'form-msg ok';
    form.reset();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'form-msg err';
  }
});

// ---------- Members ----------

async function renderMembers() {
  const list = document.getElementById('member-list');
  const members = await getMembers();
  state.members = members;

  if (members.length === 0) {
    list.innerHTML = '<div class="empty-state">no one has signed up yet.</div>';
    return;
  }

  list.innerHTML = members.map((m) => `
    <li>
      <span>${escapeHtml(m.name)}${m.id === state.currentMember?.id ? ' <span style="color: var(--text-muted); font-size: 12px;">(you)</span>' : ''}</span>
    </li>
  `).join('');
}

// ---------- Song detail / voting modal ----------

const backdrop = document.getElementById('modal-backdrop');

backdrop.addEventListener('click', (e) => {
  if (e.target === backdrop) closeModal();
});

function closeModal() {
  backdrop.classList.remove('open');
  state.activeSongId = null;
}

async function openSongModal(id) {
  state.activeSongId = id;
  const song = await getSong(id);
  renderModal(song);
  backdrop.classList.add('open');
}

function renderModal(song) {
  const modal = document.getElementById('song-modal');
  const myVote = song.votes.find((v) => v.member_id === state.currentMember.id);

  const voteButtons = [1, 2, 3, 4, 5].map((n) => `
    <button class="vote-btn ${myVote && myVote.score === n ? 'selected' : ''}" data-score="${n}">${n}</button>
  `).join('');

  const breakdown = song.votes.length
    ? song.votes.map((v) => `<div><span>${escapeHtml(v.member_name)}</span><span>${v.score}</span></div>`).join('')
    : '<div><span>no votes yet</span></div>';

  const statuses = ['proposed', 'learning', 'learned', 'shelved'];
  const statusButtons = statuses.map((s) => `
    <button class="btn-secondary status-set" data-status="${s}" ${song.status === s ? 'style="border-color: var(--amber); color: var(--amber);"' : ''}>${s}</button>
  `).join('');

  modal.innerHTML = `
    <button class="modal-close" id="modal-close-btn">&times;</button>
    <h2>${escapeHtml(song.title)}</h2>
    ${song.artist ? `<p class="modal-artist">${escapeHtml(song.artist)}</p>` : ''}
    <div class="modal-specs">
      <span class="status-pill ${song.status}">${song.status}</span>
      ${specChips(song)}
    </div>

    ${song.notes ? `<p style="color: var(--text-secondary); font-size: 13px; margin-bottom: 18px;">${escapeHtml(song.notes)}</p>` : ''}

    <div class="field" style="margin-bottom: 6px;"><label>Your vote</label></div>
    <div class="vote-scale">${voteButtons}</div>

    <div class="field" style="margin-bottom: 6px;"><label>All votes (avg ${song.avg_score ?? '—'})</label></div>
    <div class="vote-breakdown">${breakdown}</div>

    <div class="field" style="margin-bottom: 6px;"><label>Status</label></div>
    <div class="status-actions">${statusButtons}</div>
  `;

  document.getElementById('modal-close-btn').addEventListener('click', closeModal);

  modal.querySelectorAll('.vote-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await castVote(song.id, Number(btn.dataset.score));
      const updated = await getSong(song.id);
      renderModal(updated);
      renderRankings();
    });
  });

  modal.querySelectorAll('.status-set').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const updated = await patchSong(song.id, { status: btn.dataset.status });
      const full = await getSong(updated.id);
      renderModal(full);
      renderRankings();
    });
  });
}

// ---------- Utilities ----------

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Init ----------

(async function init() {
  const member = await fetchCurrentMember();
  if (!member) {
    showAuthScreen();
    return;
  }
  showAppShell(member);
  await loadMembers();
  await renderRankings();
})();
