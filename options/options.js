/* FormPilot — halaman Kelola: pengaturan, CRUD grup, profile,
   editor mapping, backup (manual & otomatis), log. */

/* global DB, AutoBackup, Vault */

const $ = (s) => document.querySelector(s);

let PROFILES = [];
let GROUPS = []; // nama grup tersimpan (bisa saja tidak punya anggota)
let EDIT = null; // profile yang sedang diedit (deep copy)
let VAULT_PASS = null; // passphrase sesi halaman Kelola (memori saja)

/* Terapkan dark mode sedini mungkin — script ini berada di akhir body. */
(async () => {
  document.body.classList.toggle('dark', await DB.getDarkMode());
})();

/* ---------- util ---------- */

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function fmtTime(ts) {
  return ts ? new Date(ts).toLocaleString() : '-';
}

function displayVal(v) {
  if (Array.isArray(v)) return v.join(' | ');
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return v == null ? '' : String(v);
}

function collectVal(s, type) {
  if (type === 'checkbox' || type === 'radio') return s.trim() === 'true';
  if (s.includes(' | ')) return s.split(' | ').map((x) => x.trim()).filter(Boolean);
  return s;
}

function groupName(p) {
  return (p.group && String(p.group).trim()) || 'Umum';
}

function fillGroupDatalist() {
  const dl = $('#groupList');
  dl.innerHTML = '';
  const names = new Set(GROUPS);
  for (const p of PROFILES) {
    const g = (p.group || '').trim();
    if (g) names.add(g);
  }
  for (const n of [...names].sort((a, b) => a.localeCompare(b, 'id'))) {
    const o = document.createElement('option');
    o.value = n;
    dl.appendChild(o);
  }
}

async function refreshGroupData() {
  GROUPS = await DB.getGroups();
  PROFILES = await DB.getProfiles();
  fillGroupDatalist();
  populateFilterOptions();
  renderGroups();
  renderProfiles();
}

/* ---------- CRUD grup ---------- */

function renderGroups() {
  const tbody = $('#groupRows');
  tbody.innerHTML = '';

  const names = new Set(GROUPS);
  for (const p of PROFILES) {
    const g = groupName(p);
    if (g !== 'Umum') names.add(g);
  }
  const list = [...names].sort((a, b) => a.localeCompare(b, 'id'));
  $('#emptyGroups').classList.toggle('hidden', list.length > 0);

  for (const name of list) {
    const count = PROFILES.filter((p) => groupName(p) === name).length;

    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = name;
    tdName.appendChild(strong);

    const tdCount = document.createElement('td');
    tdCount.textContent = count;

    const tdAct = document.createElement('td');
    const ren = document.createElement('button');
    ren.className = 'mini';
    ren.textContent = '✎ Rename';
    ren.addEventListener('click', () => renameGroupFlow(name));
    const del = document.createElement('button');
    del.className = 'mini danger';
    del.textContent = '🗑 Hapus';
    del.addEventListener('click', () => deleteGroupFlow(name));
    tdAct.append(ren, del);

    tr.append(tdName, tdCount, tdAct);
    tbody.appendChild(tr);
  }
}

async function addGroupFlow() {
  const input = $('#newGroupName');
  const name = input.value.trim();
  if (!name) return;
  try {
    await DB.addGroup(name);
    input.value = '';
    await refreshGroupData();
  } catch (e) {
    alert('Gagal: ' + e.message);
  }
}

async function renameGroupFlow(name) {
  const next = prompt('Nama baru untuk grup "' + name + '":', name);
  if (next == null) return;
  const trimmed = next.trim();
  if (!trimmed || trimmed === name) return;
  try {
    const changed = await DB.renameGroup(name, trimmed);
    await refreshGroupData();
    alert('Grup di-rename. ' + changed + ' profile ikut diperbarui.');
  } catch (e) {
    alert('Gagal: ' + e.message);
  }
}

async function deleteGroupFlow(name) {
  const count = PROFILES.filter((p) => groupName(p) === name).length;
  const msg = count
    ? 'Hapus grup "' + name + '"? ' + count + ' profile di dalamnya akan kembali ke grup "Umum".'
    : 'Hapus grup "' + name + '"?';
  if (!confirm(msg)) return;
  try {
    await DB.deleteGroup(name);
    await refreshGroupData();
  } catch (e) {
    alert('Gagal: ' + e.message);
  }
}

/* ---------- daftar profile ---------- */

/* Isi dropdown filter Grup & Tag dari data terkini; pilihan yang sedang
   aktif dipertahankan. */
function populateFilterOptions() {
  const selGroup = $('#filterGroup');
  const selTag = $('#filterTag');
  const prevGroup = selGroup.value;
  const prevTag = selTag.value;

  const groups = new Set(GROUPS);
  const tags = new Set();
  for (const p of PROFILES) {
    groups.add(groupName(p));
    (p.tags || []).forEach((t) => {
      if (t) tags.add(t);
    });
  }

  const fill = (sel, values, firstLabel, prev) => {
    sel.innerHTML = '';
    const first = document.createElement('option');
    first.value = '';
    first.textContent = firstLabel;
    sel.appendChild(first);
    for (const v of [...values].sort((a, b) => a.localeCompare(b, 'id'))) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      sel.appendChild(o);
    }
    // pertahankan pilihan lama; kalau nilainya sudah tidak ada, kembali ke "Semua"
    sel.value = [...sel.options].some((o) => o.value === prev) ? prev : '';
  };
  fill(selGroup, groups, 'Semua grup', prevGroup);
  fill(selTag, tags, 'Semua tag', prevTag);
  // tag itu opsional (hanya diisi manual di editor) — sembunyikan filternya
  // kalau belum ada satu pun profile ber-tag, agar tidak jadi pajangan
  selTag.classList.toggle('hidden', tags.size === 0);
}

function renderProfiles() {
  const q = $('#filter').value.trim().toLowerCase();
  const fGroup = $('#filterGroup').value;
  const fTag = $('#filterTag').value;
  const filtering = !!(q || fGroup || fTag);

  let list = PROFILES;
  if (fGroup) list = list.filter((p) => groupName(p) === fGroup);
  if (fTag) list = list.filter((p) => (p.tags || []).includes(fTag));
  if (q) {
    // haystack dalam: nama, grup, tag, URL pattern, catatan, dan label+nilai
    // field (mis. cari nomor quote tertentu)
    list = list.filter((p) => {
      let hay = (p.name || '') + ' ' + groupName(p) + ' ' + (p.tags || []).join(' ');
      hay += ' ' + (p.urlPattern || '') + ' ' + (p.notes || '');
      for (const f of p.fields || []) {
        hay += ' ' + (f.label || '') + ' ' + (Array.isArray(f.value) ? f.value.join(' ') : String(f.value ?? ''));
      }
      return hay.toLowerCase().includes(q);
    });
  }

  const tbody = $('#profileRows');
  tbody.innerHTML = '';
  $('#emptyProfiles').classList.toggle('hidden', list.length > 0);
  $('#emptyProfiles').textContent = !PROFILES.length
    ? 'Belum ada profile. Capture dari popup/panel, atau buat manual dengan "+ Profile Baru".'
    : 'Tidak ada profile yang cocok dengan filter — coba ubah kata kunci atau tekan Reset.';

  const info = $('#filterInfo');
  if (filtering) {
    info.textContent = 'Menampilkan ' + list.length + ' dari ' + PROFILES.length + ' profile.';
  } else {
    info.textContent = PROFILES.length
      ? PROFILES.length + ' profile.'
      : '';
  }

  const groups = DB.groupProfiles(list, '', GROUPS);
  for (const g of groups) {
    for (const p of g.items) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><strong>' + esc(p.name) + '</strong>' +
        ((p.tags || []).length ? '<br/><span class="hint">' + esc(p.tags.join(', ')) + '</span>' : '') +
        '</td>' +
        '<td>' + esc(g.name) + '</td>' +
        '<td><code>' + esc(p.urlPattern || '-') + '</code></td>' +
        '<td>' + (p.fields ? p.fields.length : 0) + '</td>' +
        '<td>' + esc(fmtTime(p.updatedAt)) + '</td>' +
        '<td>' +
        '<button class="mini" data-act="edit" data-id="' + esc(p.id) + '">Edit</button>' +
        '<button class="mini" data-act="dup" data-id="' + esc(p.id) + '">Duplikat</button>' +
        '<button class="mini danger" data-act="del" data-id="' + esc(p.id) + '">Hapus</button>' +
        '</td>';
      tbody.appendChild(tr);
    }
  }
}

/* ---------- editor ---------- */

function openEditor(p) {
  EDIT = p
    ? JSON.parse(JSON.stringify(p))
    : {
        id: null,
        name: '',
        group: '',
        urlPattern: '',
        tags: [],
        notes: '',
        archived: false,
        createdAt: null,
        updatedAt: null,
        fields: [],
      };
  $('#edTitle').textContent = p ? 'Edit: ' + p.name : 'Profile Baru';
  $('#edName').value = EDIT.name;
  $('#edGroup').value = EDIT.group || '';
  $('#edPattern').value = EDIT.urlPattern || '';
  $('#edTags').value = (EDIT.tags || []).join(', ');
  $('#edNotes').value = EDIT.notes || '';
  renderFieldRows();
  $('#editor').classList.remove('hidden');
  $('#editor').scrollIntoView({ behavior: 'smooth' });
}

function closeEditor() {
  EDIT = null;
  $('#editor').classList.add('hidden');
}

function renderFieldRows() {
  const tbody = $('#fieldRows');
  tbody.innerHTML = '';

  EDIT.fields.forEach((f, i) => {
    const tr = document.createElement('tr');
    tr.dataset.idx = i; // untuk memetakan baris kembali ke field aslinya

    const mk = (cls, val, size) => {
      const td = document.createElement('td');
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = cls;
      inp.value = val == null ? '' : String(val);
      if (size) inp.size = size;
      td.appendChild(inp);
      tr.appendChild(td);
      return inp;
    };

    mk('f-sel', f.selector);
    mk('f-lab', f.label);
    mk('f-typ', f.type || 'text', 9);
    const valInp = mk('f-val', displayVal(f.value));
    // Field terenkripsi tidak ditampilkan nilainya — biarkan kosong agar
    // nilai terenkripsi lama dipertahankan saat profile disimpan.
    if (f.encrypted) {
      valInp.value = '';
      valInp.type = 'password';
      valInp.placeholder = '(terenkripsi — kosongkan agar tidak berubah)';
    }

    const tdAct = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'mini danger';
    btn.textContent = '✕';
    btn.title = 'Hapus field ini';
    btn.addEventListener('click', () => {
      EDIT.fields.splice(i, 1);
      renderFieldRows();
    });
    tdAct.appendChild(btn);
    tr.appendChild(tdAct);

    tbody.appendChild(tr);
  });
}

function addFieldRow() {
  EDIT.fields.push({
    selector: '',
    fallbacks: [],
    label: '',
    type: 'text',
    value: '',
    sensitive: false,
  });
  renderFieldRows();
}

async function saveEditor() {
  const name = $('#edName').value.trim();
  if (!name) {
    alert('Nama profile wajib diisi.');
    return;
  }

  const rows = $('#fieldRows').querySelectorAll('tr');
  const fields = [];
  const origs = [];
  rows.forEach((tr) => {
    const selector = tr.querySelector('.f-sel').value.trim();
    if (!selector) return; // baris tanpa selector dilewati
    const type = tr.querySelector('.f-typ').value.trim() || 'text';
    const orig = EDIT.fields[Number(tr.dataset.idx)] || null;
    fields.push({
      selector,
      fallbacks: (orig && orig.fallbacks) || [],
      label: tr.querySelector('.f-lab').value.trim(),
      type,
      value: collectVal(tr.querySelector('.f-val').value, type),
      sensitive: type === 'password',
    });
    origs.push(orig);
  });

  // Nilai sensitif: pertahankan yang sudah terenkripsi (input dibiarkan
  // kosong), atau segel nilai baru bila enkripsi aktif.
  const vaultActive = await Vault.isActive();
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const orig = origs[i];
    if (!f.sensitive) continue;
    if (orig && orig.encrypted && !f.value) {
      f.value = orig.value;
      f.encrypted = true;
      continue;
    }
    if (vaultActive) {
      if (!VAULT_PASS) {
        alert(
          'Ada field password. Buka sesi enkripsi dulu di bagian Keamanan ' +
            '(masukkan passphrase → klik "Buka sesi"), lalu simpan lagi.'
        );
        return;
      }
      f.value = await Vault.seal(JSON.stringify(f.value ?? ''), VAULT_PASS);
      f.encrypted = true;
    }
  }

  const now = Date.now();
  EDIT.name = await DB.uniqueName(name, EDIT.id || null);
  EDIT.group = $('#edGroup').value.trim();
  EDIT.urlPattern = $('#edPattern').value.trim();
  EDIT.tags = $('#edTags').value.split(',').map((t) => t.trim()).filter(Boolean);
  EDIT.notes = $('#edNotes').value.trim();
  EDIT.fields = fields;
  EDIT.updatedAt = now;
  if (!EDIT.createdAt) EDIT.createdAt = now;
  if (!EDIT.id) EDIT.id = DB.uid();

  await DB.upsertProfile(JSON.parse(JSON.stringify(EDIT)));
  await refreshGroupData();
  closeEditor();
}

/* ---------- aksi list ---------- */

async function duplicateProfile(id) {
  const p = PROFILES.find((x) => x.id === id);
  if (!p) return;
  const copy = JSON.parse(JSON.stringify(p));
  copy.id = DB.uid();
  copy.name = await DB.uniqueName(p.name + ' (copy)');
  copy.createdAt = Date.now();
  copy.updatedAt = Date.now();
  await DB.addProfile(copy);
  PROFILES = await DB.getProfiles();
  renderGroups();
  renderProfiles();
}

async function deleteProfile(id) {
  const p = PROFILES.find((x) => x.id === id);
  if (!p) return;
  if (!confirm('Hapus profile "' + p.name + '"?')) return;
  await DB.deleteProfile(id);
  PROFILES = await DB.getProfiles();
  renderGroups();
  renderProfiles();
}

/* ---------- backup ---------- */

async function doExport() {
  const payload = {
    kind: 'qa-form-autofill-export',
    version: 2,
    exportedAt: new Date().toISOString(),
    groups: await DB.getGroups(),
    profiles: PROFILES,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'formpilot-export-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function doImport(file) {
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data) ? data : data.profiles;
    if (!Array.isArray(incoming)) throw new Error('File bukan hasil export FormPilot.');

    const existing = await DB.getProfiles();
    const ids = new Set(existing.map((p) => p.id));
    const now = Date.now();
    let added = 0;

    for (const p of incoming) {
      if (!p || !Array.isArray(p.fields)) continue;
      if (!p.id || ids.has(p.id)) p.id = DB.uid();
      ids.add(p.id);
      existing.push({
        urlPattern: '',
        group: '',
        tags: [],
        notes: '',
        archived: false,
        createdAt: now,
        updatedAt: now,
        ...p,
        updatedAt: now,
      });
      added++;
    }
    // Bila sesi enkripsi terbuka, segel juga nilai sensitif hasil import
    // (sekaligus nilai polos lain) agar data at-rest tetap terenkripsi.
    if ((await Vault.isActive()) && VAULT_PASS) {
      for (const p of existing) await Vault.sealFields(p.fields || []);
    }
    await DB.saveProfiles(existing);

    // Gabungkan daftar grup dari export (jika ada)
    if (Array.isArray(data.groups)) {
      const stored = await DB.getGroups();
      const lower = new Set(stored.map((g) => g.toLowerCase()));
      for (const g of data.groups) {
        const n = String(g || '').trim();
        if (n && n.toLowerCase() !== 'umum' && !lower.has(n.toLowerCase())) {
          stored.push(n);
          lower.add(n.toLowerCase());
        }
      }
      await DB.saveGroups(stored);
    }

    await refreshGroupData();
    alert('Import sukses: ' + added + ' profile ditambahkan.');
  } catch (e) {
    alert('Import gagal: ' + e.message);
  }
}

/* ---------- ganti base url massal ---------- */

/* Ambil bagian origin dari URL Pattern (glob): "https://host:port/path/**"
   → { origin: "https://host:port", rest: "/path/**" }. Null bila tak berpola
   (mis. pattern diawali "**"), sehingga pattern begitu tidak pernah tersentuh. */
function patternOrigin(pattern) {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/\s]+)\/?([\s\S]*)$/i.exec((pattern || '').trim());
  return m
    ? { origin: m[1].toLowerCase() + '://' + m[2].toLowerCase(), rest: '/' + (m[3] || '') }
    : null;
}

/* Lengkapi input pengguna: tanpa skema → https, buang trailing slash. */
function normalizeBase(s) {
  s = (s || '').trim();
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  return s.replace(/\/+$/, '');
}

function openBaseUrlDialog() {
  const dl = $('#baseList');
  dl.innerHTML = '';
  const origins = new Set();
  for (const p of PROFILES) {
    const o = patternOrigin(p.urlPattern);
    if (o) origins.add(o.origin);
  }
  for (const s of [...origins].sort()) {
    const o = document.createElement('option');
    o.value = s;
    dl.appendChild(o);
  }
  // Hanya satu origin di semua profile? Isikan langsung biar tinggal isi yang baru.
  $('#oldBase').value = origins.size === 1 ? [...origins][0] : '';
  $('#newBase').value = '';
  $('#btnApplyBase').disabled = true;
  $('#btnApplyBase').textContent = 'Ganti Base URL (0 profile)';
  $('#basePreview').innerHTML = '';
  $('#dlgBaseUrl').showModal();
}

function applyBaseUrlPreview() {
  const oldBase = normalizeBase($('#oldBase').value).toLowerCase();
  const newBase = normalizeBase($('#newBase').value);
  const preview = $('#basePreview');
  const btn = $('#btnApplyBase');
  preview.innerHTML = '';

  const affected =
    oldBase && newBase
      ? PROFILES.map((p) => {
          const o = patternOrigin(p.urlPattern);
          return o && o.origin === oldBase ? { p, next: newBase + o.rest } : null;
        }).filter(Boolean)
      : [];

  for (const a of affected) {
    const row = document.createElement('div');
    row.className = 'bp-row';
    row.innerHTML =
      '<strong>' + esc(a.p.name) + '</strong><br/>' +
      '<span class="bp-old">' + esc(a.p.urlPattern || '-') + '</span>' +
      ' → <span class="bp-new">' + esc(a.next) + '</span>';
    preview.appendChild(row);
  }

  if (PROFILES.length && (oldBase || newBase)) {
    const info = document.createElement('div');
    info.className = 'bp-skip';
    info.textContent = affected.length
      ? (PROFILES.length - affected.length) + ' profile lain tidak tersentuh (origin-nya berbeda).'
      : 'Tidak ada profile dengan origin "' + (oldBase || '—') + '".';
    preview.appendChild(info);
  }

  btn.disabled = !affected.length;
  btn.textContent = 'Ganti Base URL (' + affected.length + ' profile)';
}

async function applyBaseUrlReplace() {
  const oldBase = normalizeBase($('#oldBase').value).toLowerCase();
  const newBase = normalizeBase($('#newBase').value);
  if (!oldBase || !newBase) return;

  const now = Date.now();
  let n = 0;
  for (const p of PROFILES) {
    const o = patternOrigin(p.urlPattern);
    if (!o || o.origin !== oldBase) continue;
    p.urlPattern = newBase + o.rest;
    p.updatedAt = now;
    await DB.upsertProfile(JSON.parse(JSON.stringify(p)));
    n++;
  }
  await refreshGroupData();
  $('#dlgBaseUrl').close();
  alert('Base URL diganti untuk ' + n + ' profile.');
}

/* ---------- keamanan (enkripsi nilai sensitif) ---------- */

async function refreshVaultUi() {
  const active = await Vault.isActive();
  const open = active && !!VAULT_PASS;
  $('#btnVaultPrimary').textContent = open ? '✅ Sesi terbuka' : active ? '🔓 Buka sesi' : '🔐 Aktifkan enkripsi';
  $('#btnVaultPrimary').disabled = open;
  $('#btnVaultChange').classList.toggle('hidden', !open);
  $('#btnVaultOff').classList.toggle('hidden', !open);
  $('#vaultStatus').textContent = !active
    ? 'Enkripsi nonaktif — nilai field sensitif (password) tersimpan apa adanya.'
    : open
      ? 'Enkripsi aktif — sesi terbuka di halaman ini, nilai terenkripsi bisa diedit/dipakai.'
      : 'Enkripsi aktif — isi passphrase lalu klik "Buka sesi" untuk mengedit nilai terenkripsi.';
}

/* Segel semua field sensitif yang masih polos; return jumlah nilai yang
   baru dienkripsi. Dipakai saat aktivasi & saat sesi dibuka (menyisakan
   profil import yang masih polos ikut terenkripsi). */
async function encryptAllSensitive() {
  const profiles = await DB.getProfiles();
  let n = 0;
  for (const p of profiles) {
    const c = JSON.parse(JSON.stringify(p));
    const before = JSON.stringify(c.fields);
    await Vault.sealFields(c.fields);
    if (JSON.stringify(c.fields) === before) continue;
    await DB.upsertProfile(c);
    n += c.fields.filter((f) => f.sensitive && f.encrypted).length;
  }
  if (n) await refreshGroupData();
  return n;
}

async function vaultPrimaryAction() {
  const pass = $('#vaultPass').value;
  if (!(await Vault.isActive())) {
    if (!Vault.subtleOk()) return alert('Web Crypto tidak tersedia di browser ini.');
    if (pass.length < 4) return alert('Passphrase minimal 4 karakter. Jangan sampai lupa — tidak ada reset!');
    await Vault.activate(pass);
    VAULT_PASS = pass;
    const n = await encryptAllSensitive();
    alert(
      'Enkripsi diaktifkan' + (n ? ' — ' + n + ' nilai sensitif sudah terenkripsi.' : '.') +
      '\n\nPENTING: passphrase tidak bisa dipulihkan. Simpan di tempat aman.'
    );
  } else {
    if (VAULT_PASS) return;
    try {
      await Vault.unlock(pass);
    } catch (e) {
      return alert(e.message);
    }
    VAULT_PASS = pass;
    await encryptAllSensitive(); // enkripsi sisa profil polos (mis. hasil import)
  }
  $('#vaultPass').value = '';
  refreshVaultUi();
}

async function vaultChangePassAction() {
  const next = prompt('Passphrase baru (min. 4 karakter):');
  if (next == null) return;
  if (next.length < 4) return alert('Passphrase minimal 4 karakter.');
  // Buka semua dengan passphrase lama (sesi), lalu segel ulang dengan yang baru.
  const clones = [];
  for (const p of await DB.getProfiles()) {
    const c = JSON.parse(JSON.stringify(p));
    await Vault.openFields(c.fields);
    clones.push(c);
  }
  await Vault.activate(next);
  for (const c of clones) {
    await Vault.sealFields(c.fields);
    await DB.upsertProfile(c);
  }
  VAULT_PASS = next;
  await refreshGroupData();
  refreshVaultUi();
  alert('Passphrase diganti. Semua nilai sensitif dienkripsi ulang.');
}

async function vaultOffAction() {
  if (!confirm('Nonaktifkan enkripsi? SEMUA nilai sensitif akan didekripsi dan tersimpan apa adanya.')) return;
  for (const p of await DB.getProfiles()) {
    const c = JSON.parse(JSON.stringify(p));
    await Vault.openFields(c.fields);
    await DB.upsertProfile(c);
  }
  await Vault.deactivate();
  VAULT_PASS = null;
  await refreshGroupData();
  refreshVaultUi();
  alert('Enkripsi dinonaktifkan.');
}

/* ---------- backup otomatis ---------- */

async function refreshBackupStatus() {
  const st = await DB.getAutoBackupState();
  const handle = await DB.idbGetHandle();
  $('#btnRegrant').classList.toggle('hidden', !st.needsPermission);

  let s;
  if (!handle) {
    s = 'Folder backup belum dipilih.';
  } else if (st.needsPermission) {
    s = '⚠ Izin folder perlu diberikan ulang — klik "Beri izin ulang".';
  } else if (st.lastBackupAt) {
    s = 'Backup terakhir: ' + fmtTime(st.lastBackupAt) + '.';
  } else {
    s = 'Folder siap — backup pertama jalan setelah ada perubahan data, atau klik "Backup sekarang".';
  }
  if (st.error) s += ' Error terakhir: ' + st.error;
  $('#backupStatus').textContent = s;
}

async function pickBackupDir() {
  if (typeof showDirectoryPicker !== 'function') {
    alert('Browser ini belum mendukung pemilihan folder (butuh Chrome/Edge terbaru).');
    return;
  }
  try {
    const dir = await showDirectoryPicker({ id: 'qa-autofill', mode: 'readwrite' });
    await DB.idbSetHandle(dir);
    await DB.setAutoBackupEnabled(true);
    $('#setAutoBackup').checked = true;
    await AutoBackup.run(true); // backup pertama langsung setelah pilih folder
  } catch (e) {
    if (e && e.name !== 'AbortError') alert('Gagal memilih folder: ' + ((e && e.message) || e));
  }
  refreshBackupStatus();
}

async function backupNow() {
  try {
    const r = await AutoBackup.run(true); // manual boleh walau auto nonaktif
    if (!r.ok) alert(r.reason || 'Auto backup nonaktif.');
  } catch (e) {
    alert('Backup gagal: ' + ((e && e.message) || e));
  }
  refreshBackupStatus();
}

async function regrantBackupFolder() {
  try {
    const handle = await DB.idbGetHandle();
    if (!handle) return;
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      await chrome.storage.local.set({ backupNeedsPermission: false });
      await AutoBackup.run(true);
    }
  } catch (e) {
    alert('Gagal memberi izin: ' + ((e && e.message) || e));
  }
  refreshBackupStatus();
}

/* ---------- log ---------- */

async function renderLogs() {
  const logs = await DB.getLogs();
  const tbody = $('#logRows');
  tbody.innerHTML = '';
  $('#emptyLogs').classList.toggle('hidden', logs.length > 0);

  for (const l of logs) {
    const tr = document.createElement('tr');
    const hasil =
      l.filled + ' terisi' +
      (l.skipped ? ' — ' + l.skipped + ' diisi manual (upload file)' : '') +
      (l.failedFields && l.failedFields.length
        ? ' — gagal: ' + esc(l.failedFields.join(', '))
        : '');
    tr.innerHTML =
      '<td>' + esc(fmtTime(l.ts)) + '</td>' +
      '<td>' + esc(l.profileName || '-') + '</td>' +
      '<td><span class="hint">' + esc((l.url || '').slice(0, 60)) + '</span></td>' +
      '<td>' + hasil + '</td>';
    tbody.appendChild(tr);
  }
}

/* ---------- init ---------- */

document.addEventListener('DOMContentLoaded', async () => {
  await refreshGroupData();
  renderLogs();

  $('#setWidget').checked = await DB.getWidgetEnabled();
  $('#setWidget').addEventListener('change', (e) => DB.setWidgetEnabled(e.target.checked));

  $('#setDark').checked = await DB.getDarkMode();
  $('#setDark').addEventListener('change', (e) => {
    document.body.classList.toggle('dark', e.target.checked);
    DB.setDarkMode(e.target.checked);
  });

  $('#setDrag').checked = await DB.getWidgetDragEnabled();
  $('#setDrag').addEventListener('change', (e) => DB.setWidgetDragEnabled(e.target.checked));

  $('#setUrlMatch').checked = await DB.getShowUrlMatchedOnly();
  $('#setUrlMatch').addEventListener('change', (e) => DB.setShowUrlMatchedOnly(e.target.checked));

  // Panduan Cepat: tombol sembunyikan/tampilkan isi — judul panel tetap terlihat,
  // dan posisi terakhir (collapsed/expanded) diingat saat halaman dibuka lagi.
  const guide = $('.guide');
  const btnGuideToggle = $('#btnGuideToggle');
  const applyGuideCollapsed = (collapsed) => {
    guide.classList.toggle('collapsed', collapsed);
    btnGuideToggle.textContent = collapsed ? '▾ Tampilkan' : '▴ Sembunyikan';
  };
  applyGuideCollapsed(await DB.getGuideCollapsed());
  btnGuideToggle.addEventListener('click', () => {
    const collapsed = !guide.classList.contains('collapsed');
    applyGuideCollapsed(collapsed);
    DB.setGuideCollapsed(collapsed);
  });

  const abState = await DB.getAutoBackupState();
  $('#setAutoBackup').checked = abState.enabled;
  $('#setAutoBackup').addEventListener('change', async (e) => {
    if (e.target.checked && !(await DB.idbGetHandle())) {
      alert('Pilih folder backup dulu sebelum mengaktifkan auto backup.');
      e.target.checked = false;
      return;
    }
    await DB.setAutoBackupEnabled(e.target.checked);
    if (!e.target.checked) chrome.alarms.clear(AutoBackup.ALARM); // disabled: batalkan jadwal pending
    refreshBackupStatus();
  });
  $('#btnPickDir').addEventListener('click', pickBackupDir);
  $('#btnBackupNow').addEventListener('click', backupNow);
  $('#btnRegrant').addEventListener('click', regrantBackupFolder);
  refreshBackupStatus();

  $('#filter').addEventListener('input', renderProfiles);
  $('#filterGroup').addEventListener('change', renderProfiles);
  $('#filterTag').addEventListener('change', renderProfiles);
  $('#btnFilterReset').addEventListener('click', () => {
    $('#filter').value = '';
    $('#filterGroup').value = '';
    $('#filterTag').value = '';
    renderProfiles();
    $('#filter').focus();
  });

  $('#btnNew').addEventListener('click', () => openEditor(null));
  $('#btnAddField').addEventListener('click', addFieldRow);
  $('#btnSaveProfile').addEventListener('click', saveEditor);
  $('#btnCancelEdit').addEventListener('click', closeEditor);

  $('#btnAddGroup').addEventListener('click', addGroupFlow);
  $('#newGroupName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addGroupFlow();
  });

  $('#profileRows').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const { act, id } = btn.dataset;
    if (act === 'edit') openEditor(PROFILES.find((x) => x.id === id));
    else if (act === 'dup') duplicateProfile(id);
    else if (act === 'del') deleteProfile(id);
  });

  $('#btnExport').addEventListener('click', doExport);
  $('#btnImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) doImport(f);
    e.target.value = '';
  });

  // Ganti base URL massal (dialog)
  $('#btnBaseUrl').addEventListener('click', openBaseUrlDialog);
  $('#oldBase').addEventListener('input', applyBaseUrlPreview);
  $('#newBase').addEventListener('input', applyBaseUrlPreview);
  $('#btnApplyBase').addEventListener('click', applyBaseUrlReplace);
  $('#btnCancelBase').addEventListener('click', () => $('#dlgBaseUrl').close());

  // Keamanan (enkripsi nilai sensitif)
  $('#btnVaultPrimary').addEventListener('click', vaultPrimaryAction);
  $('#btnVaultChange').addEventListener('click', vaultChangePassAction);
  $('#btnVaultOff').addEventListener('click', vaultOffAction);
  $('#vaultPass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') vaultPrimaryAction();
  });
  refreshVaultUi();

  $('#btnClearLog').addEventListener('click', async () => {
    if (!confirm('Hapus semua fill log?')) return;
    await DB.clearLogs();
    renderLogs();
  });

  $('#btnClearAll').addEventListener('click', async () => {
    if (!confirm('Yakin hapus SEMUA data (profile, grup, dan log)? Tindakan ini tidak bisa dibatalkan. Export dulu jika perlu!')) return;
    await DB.clearAll();
    GROUPS = [];
    PROFILES = [];
    fillGroupDatalist();
    renderGroups();
    renderProfiles();
    renderLogs();
  });
});
