/* FormPilot — popup: daftar profile (tergroup), capture, fill. */

/* global DB, resolvePlaceholders, Vault */

const $ = (s) => document.querySelector(s);

const UNSUPPORTED = /^(chrome|edge|about|devtools|view-source|chrome-extension):/i;

let TAB = null;
let PROFILES = [];
let PENDING = null; // hasil capture yang menunggu disimpan
let CANDIDATES = []; // kandidat profile untuk diupdate dari capture ini
let VAULT_PASS = null; // passphrase sesi popup (memori saja)
let vaultAction = null; // aksi tertunda yang lanjut setelah passphrase dibuka

/* ---------- util ---------- */

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

/* Pastikan content agent ada di tab (inject sekali, idempotent). */
async function ensureAgent(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'QA_PING' });
    if (res && res.ok) return true;
  } catch {
    /* belum ter-inject -> suntik di bawah */
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/form-agent.js'],
    });
    return true;
  } catch {
    return false;
  }
}

function showResult(message, kind) {
  const el = $('#fillResult');
  el.textContent = message;
  el.className = 'result ' + kind; // ok | warn | err
  el.classList.remove('hidden');
}

/* ---------- gerbang enkripsi (vault) ---------- */

/* Siapkan salinan fields sesuai mode: 'fill' → terdekripsi; 'store' →
   field sensitif polos dienkripsi bila vault aktif. Return null berarti
   passphrase dibutuhkan tapi sesi belum terbuka — form passphrase
   dimunculkan dan aksi dilanjutkan otomatis setelah berhasil. */
async function prepareFields(fields, mode) {
  const copy = JSON.parse(JSON.stringify(fields || []));
  if (mode === 'fill') {
    if (!Vault.needsOpen(copy)) return copy;
    if (!VAULT_PASS) return null;
    await Vault.unlock(VAULT_PASS); // sinkron dengan vault terkini
    await Vault.openFields(copy);
    return copy;
  }
  if ((await Vault.isActive()) && Vault.hasPlainSensitive(copy)) {
    if (!VAULT_PASS) return null;
    await Vault.unlock(VAULT_PASS);
    await Vault.sealFields(copy);
  }
  return copy;
}

function gated(fields, mode, fn) {
  prepareFields(fields, mode)
    .then(async (copy) => {
      if (copy === null) {
        vaultAction = () => gated(fields, mode, fn);
        $('#vaultMsg').textContent =
          mode === 'fill'
            ? '🔐 Profile ini punya field terenkripsi — masukkan passphrase untuk Fill.'
            : '🔐 Enkripsi aktif — masukkan passphrase untuk menyimpan field password.';
        $('#vaultPanel').classList.remove('hidden');
        $('#vaultPass').value = '';
        $('#vaultPass').focus();
        return;
      }
      await fn(copy);
    })
    .catch((e) => {
      if (/Passphrase salah/.test(e.message)) VAULT_PASS = null; // sesi basi
      showResult('Gagal: ' + e.message, 'err');
    });
}

async function submitVaultPass() {
  const pass = $('#vaultPass').value;
  if (!pass) return;
  if (!Vault.subtleOk()) {
    showResult('Web Crypto tidak tersedia di browser ini.', 'err');
    return;
  }
  try {
    await Vault.unlock(pass);
  } catch (e) {
    showResult(e.message, 'err');
    return;
  }
  VAULT_PASS = pass;
  $('#vaultPass').value = '';
  $('#vaultPanel').classList.add('hidden');
  showResult('Sesi keamanan terbuka.', 'ok');
  const a = vaultAction;
  vaultAction = null;
  if (a) a(); // lanjutkan aksi yang tadi tertunda
}

/* ---------- datalist grup ---------- */

async function fillGroupDatalist() {
  const dl = $('#groupList');
  dl.innerHTML = '';
  for (const n of await DB.allGroupNames()) {
    const o = document.createElement('option');
    o.value = n;
    dl.appendChild(o);
  }
}

/* ---------- daftar profile ---------- */

async function renderList() {
  const q = $('#search').value.trim().toLowerCase();
  const url = TAB && TAB.url ? TAB.url : '';

  let list = PROFILES.filter((p) => !p.archived);
  if (q) {
    list = list.filter((p) =>
      ((p.name || '') + ' ' + (p.tags || []).join(' ') + ' ' + (p.group || ''))
        .toLowerCase()
        .includes(q)
    );
  }

  const groups = DB.groupProfiles(list, url, await DB.getGroups());
  const box = $('#profileList');
  box.innerHTML = '';

  if (!groups.length) {
    box.innerHTML =
      '<div class="empty">Belum ada profile.<br/>Isi form di halaman target, lalu klik "Capture form ini".</div>';
    return;
  }

  // Pengaturan "grup sesuai URL": sembunyikan grup yang tidak punya
  // profile yang cocok dengan halaman aktif (default ON).
  let visible = groups;
  if (await DB.getShowUrlMatchedOnly()) {
    visible = groups.filter((g) => g.items.some((p) => DB.isMatch(p.urlPattern, url)));
    if (!visible.length) {
      box.innerHTML =
        '<div class="empty">Tidak ada grup yang cocok dengan halaman ini.<br/>' +
        '(Filter "grup sesuai URL" aktif — matikan di ⚙ Kelola → Pengaturan untuk melihat semua grup.)</div>';
      return;
    }
  }

  const uiState = await DB.getGroupUiState();
  for (const g of visible) {
    const det = document.createElement('details');
    det.className = 'grp';
    det.open = Object.prototype.hasOwnProperty.call(uiState, g.name)
      ? !!uiState[g.name]
      : groups.length <= 3 || g.items.some((p) => DB.isMatch(p.urlPattern, url));
    let lastOpen = det.open;
    det.addEventListener('toggle', () => {
      if (det.open === lastOpen) return; // abaikan event dari render awal
      lastOpen = det.open;
      DB.getGroupUiState()
        .then((st) => {
          st[g.name] = det.open;
          return DB.setGroupUiState(st);
        })
        .catch(() => {});
    });

    const anyMatch = g.items.some((p) => DB.isMatch(p.urlPattern, url));
    const sum = document.createElement('summary');
    sum.innerHTML =
      esc(g.name) + ' (' + g.items.length + ')' +
      (anyMatch ? '<span class="badge">match</span>' : '');
    det.appendChild(sum);

    for (const p of g.items) {
      const matched = DB.isMatch(p.urlPattern, url);
      const item = document.createElement('div');
      item.className = 'item' + (matched ? ' matched' : '');
      item.innerHTML =
        '<div class="item-main">' +
        '<span class="name">' + esc(p.name) + '</span>' +
        '<span class="meta">' + (p.fields ? p.fields.length : 0) + ' field' +
        (p.urlPattern ? ' • ' + esc(p.urlPattern) : '') + '</span>' +
        '</div>' +
        '<button class="fill" data-id="' + esc(p.id) + '">Fill</button>';
      det.appendChild(item);
    }
    box.appendChild(det);
  }
}

/* ---------- highlight capture ---------- */

/* Bersihkan highlight capture di tab (dipanggil saat simpan/batal/popup
   ditutup). Gagal kirim diabaikan — agent mungkin belum ada di tab itu. */
function clearCaptureHighlight() {
  if (!TAB) return;
  try {
    chrome.tabs.sendMessage(TAB.id, { type: 'QA_CLEAR_HL' }).catch(() => {});
  } catch {
    /* konteks extension sudah invalid — biarkan */
  }
}

/* ---------- fill ---------- */

async function fillProfile(id) {
  const p = PROFILES.find((x) => x.id === id);
  if (!p || !TAB) return;

  if (TAB.url && UNSUPPORTED.test(TAB.url)) {
    showResult('Halaman ini tidak didukung (chrome://, web store, dll).', 'err');
    return;
  }
  const ready = await ensureAgent(TAB.id);
  if (!ready) {
    showResult('Gagal menyuntikkan script ke halaman ini.', 'err');
    return;
  }
  gated(p.fields, 'fill', (fields) => performFill(p, fields));
}

async function performFill(p, fields) {
  const values = (fields || []).map((f) => ({
    ...f,
    value: typeof f.value === 'string' ? resolvePlaceholders(f.value) : f.value,
  }));

  let res;
  try {
    res = await chrome.tabs.sendMessage(TAB.id, { type: 'QA_FILL', values });
  } catch (e) {
    showResult('Gagal mengirim perintah fill: ' + e.message, 'err');
    return;
  }

  const skipped = res.skipped || 0;
  const fails = res.results
    .filter((r) => !r.ok && !r.skipped)
    .map((r) => (r.label || r.selector) + (r.reason ? ' — ' + r.reason : ''));
  let msg = '✔ ' + res.filled + ' field terisi.';
  if (skipped) msg += ' ⏭ ' + skipped + ' diisi manual (upload file).';
  if (res.failed) msg += ' ✖ ' + res.failed + ' gagal: ' + fails.join(', ');

  showResult(msg, res.failed === 0 ? 'ok' : 'warn');
  await DB.addLog({
    id: DB.uid(),
    ts: Date.now(),
    url: TAB.url || '',
    profileId: p.id,
    profileName: p.name,
    filled: res.filled,
    skipped,
    failedFields: fails,
  });
}

/* ---------- capture ---------- */

async function startCapture() {
  if (!TAB) return;
  if (TAB.url && UNSUPPORTED.test(TAB.url)) {
    showResult('Halaman ini tidak mendukung capture.', 'err');
    return;
  }
  const ready = await ensureAgent(TAB.id);
  if (!ready) {
    showResult('Gagal menyuntikkan script ke halaman ini.', 'err');
    return;
  }
  const res = await chrome.tabs.sendMessage(TAB.id, { type: 'QA_CAPTURE' });
  if (!res.data || !res.data.count) {
    showResult('Tidak ada field terisi yang terdeteksi — isi form dulu, baru capture.', 'err');
    return;
  }
  PENDING = res.data;
  const capTitle = $('#capTitle');
  capTitle.textContent = PENDING.title || '(tanpa judul halaman)';
  capTitle.title = capTitle.textContent;
  const sens = PENDING.fields.filter((f) => f.sensitive).length;
  $('#capInfo').textContent =
    PENDING.count + ' field terdeteksi' +
    (sens ? ' — termasuk ' + sens + ' field password (tersimpan apa adanya)' : '') +
    '.';
  $('#profName').value = (PENDING.title || '').slice(0, 60) || 'Profile baru';
  try {
    $('#profGroup').value = new URL(TAB.url).hostname;
  } catch {
    $('#profGroup').value = '';
  }
  CANDIDATES = await DB.findUpdateCandidates(TAB.url, PENDING.fields);
  renderUpdateCandidates();
  $('#capturePanel').classList.remove('hidden');
  $('#btnCapture').classList.add('hidden');
  $('#profName').focus();
}

/* Tombol "Perbarui" hanya muncul bila ada profile serupa (URL cocok +
   ada field yang sama); capture fresh tidak menampilkan tombol ini. */
function renderUpdateCandidates() {
  const box = $('#capUpdate');
  box.innerHTML = '';
  if (!CANDIDATES.length) {
    box.classList.add('hidden');
    return;
  }
  const lbl = document.createElement('div');
  lbl.className = 'cap-update-label';
  lbl.textContent = 'Profile serupa terdeteksi — perbarui?';
  box.appendChild(lbl);
  for (const c of CANDIDATES.slice(0, 5)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = '🔄 ' + c.profile.name + ' (' + c.overlap + ' field sama)';
    b.title = 'Timpa field profile ini dengan hasil capture sekarang';
    b.addEventListener('click', () => updateProfile(c.profile.id));
    box.appendChild(b);
  }
  box.classList.remove('hidden');
}

async function updateProfile(id) {
  if (!PENDING) return;
  const p = (await DB.getProfiles()).find((x) => x.id === id);
  if (!p) return;
  gated(PENDING.fields, 'store', (fields) => finishUpdateProfile(p, fields));
}

async function finishUpdateProfile(p, fields) {
  p.fields = fields;
  p.updatedAt = Date.now();
  await DB.upsertProfile(p);
  PENDING = null;
  CANDIDATES = [];
  clearCaptureHighlight();
  $('#capturePanel').classList.add('hidden');
  $('#capUpdate').classList.add('hidden');
  $('#btnCapture').classList.remove('hidden');
  showResult('Profile "' + p.name + '" diperbarui (' + p.fields.length + ' field).', 'ok');
  PROFILES = await DB.getProfiles();
  await renderList();
}

async function saveCapture() {
  if (!PENDING) return;
  const name = await DB.uniqueName(
    $('#profName').value.trim() || 'Profile ' + new Date().toLocaleString()
  );
  let pattern = '';
  try {
    pattern = new URL(TAB.url).origin + '/**';
  } catch {
    /* url tidak valid -> pattern kosong */
  }
  gated(PENDING.fields, 'store', (fields) => finishSaveCapture(name, pattern, fields));
}

async function finishSaveCapture(name, pattern, fields) {
  const now = Date.now();
  await DB.addProfile({
    id: DB.uid(),
    name,
    group: $('#profGroup').value.trim(),
    urlPattern: pattern,
    tags: [],
    notes: '',
    archived: false,
    createdAt: now,
    updatedAt: now,
    fields,
  });
  PENDING = null;
  clearCaptureHighlight();
  $('#capturePanel').classList.add('hidden');
  $('#btnCapture').classList.remove('hidden');
  PROFILES = await DB.getProfiles();
  await fillGroupDatalist();
  await renderList();
}

function cancelCapture() {
  PENDING = null;
  CANDIDATES = [];
  vaultAction = null; // batal juga batalkan aksi yang menunggu passphrase
  $('#vaultPanel').classList.add('hidden');
  clearCaptureHighlight();
  $('#capturePanel').classList.add('hidden');
  $('#capUpdate').classList.add('hidden');
  $('#btnCapture').classList.remove('hidden');
}

/* ---------- init ---------- */

document.addEventListener('DOMContentLoaded', async () => {
  TAB = await activeTab();
  const url = TAB && TAB.url ? TAB.url : '(URL tidak diketahui — buka tab web biasa)';
  $('#tabUrl').textContent = url;
  $('#tabUrl').title = url;
  if (TAB && TAB.url && UNSUPPORTED.test(TAB.url)) {
    $('#btnCapture').disabled = true;
    $('#btnCapture').title = 'Halaman internal browser tidak didukung';
  }

  PROFILES = await DB.getProfiles();
  await fillGroupDatalist();
  renderList();

  $('#btnCapture').addEventListener('click', startCapture);
  $('#btnSaveCapture').addEventListener('click', saveCapture);
  $('#btnCancelCapture').addEventListener('click', cancelCapture);
  $('#btnOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('#btnVaultGo').addEventListener('click', submitVaultPass);
  $('#vaultPass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitVaultPass();
  });
  $('#search').addEventListener('input', renderList);
  $('#profileList').addEventListener('click', (e) => {
    const btn = e.target.closest('.fill');
    if (btn) fillProfile(btn.dataset.id);
  });

  // Popup bisa tertutup tanpa tombol Batal (user klik di luar) — usahakan
  // highlight capture ikut dibersihkan. Best-effort: pengiriman pesan saat
  // halaman ditutup tidak selalu sempat terkirim; highlight tertinggal pun
  // tetap akan diganti/dibersihkan oleh capture atau panel berikutnya.
  window.addEventListener('unload', clearCaptureHighlight);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') clearCaptureHighlight();
  });
});
