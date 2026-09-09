/* FormPilot (sebelumnya QA Form Autofill) — Panel cepat di pojok kanan bawah.
   Muncul otomatis di setiap halaman http/https (content script).
   Tombol QA bisa digeser bila "mode geser" AKTIF (posisinya tersimpan);
   bila MATI, tombol terkunci di lokasi default (pojok kanan bawah).
   Dapat dinonaktifkan dari panel sendiri atau diaktifkan ulang
   dari halaman Kelola (setting widgetEnabled). */

/* global DB, resolvePlaceholders, Vault */

(() => {
  if (window.__qaWidgetLoaded) return;
  window.__qaWidgetLoaded = true;

  const FAB_SIZE = 44;
  const EDGE = 20; // jarak default dari tepi layar
  const DRAG_THRESHOLD = 5; // px — di bawah ini dianggap klik, bukan drag

  let host = null;
  let panel = null;
  let listEl = null;
  let searchInput = null;
  let searchTimer = null;
  let resultEl = null;
  let capWrap = null;
  let capTitle = null;
  let capName = null;
  let capGroup = null;
  let capInfo = null;
  let capUpd = null; // container tombol "Perbarui profile" saat capture
  let dlEl = null;
  let fab = null;
  let geserBtn = null;
  let pending = null; // hasil capture yang menunggu disimpan
  let vaultWrap = null;
  let vaultMsg = null;
  let vaultInput = null;
  let vaultPassOpen = null; // passphrase sesi tab ini (memori saja)
  let vaultAction = null; // aksi tertunda yang lanjut setelah passphrase dibuka

  let dragEnabled = false;
  let pDown = null; // {x, y, moved, grabDX, grabDY}
  let suppressClick = false;

  /* ---- lifecycle: extension di-reload/update ----
     Instance widget yang tertinggal di tab lama kehilangan konteks
     extension; setiap panggilan chrome.* melempar "Extension context
     invalidated". Deteksinya via chrome.runtime.id yang jadi undefined,
     lalu widget basi dibersihkan dan instance berhenti dengan rapi. */
  function extValid() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function teardownStale() {
    if (host) {
      host.remove();
      host = null;
    }
  }

  /* Bungkus aksi yang menyentuh chrome.* — kalau konteks sudah invalid,
     rapikan DOM tanpa melempar error; error asli tetap dibiarkan naik. */
  async function safeRun(fn) {
    if (!extValid()) return teardownStale();
    try {
      await fn();
    } catch (e) {
      if (!extValid()) return teardownStale();
      throw e;
    }
  }

  /* ---------- selalu terdepan (top layer) ---------- */

  /* Modal native halaman (<dialog>.showModal()) dirender di TOP LAYER —
     di atas z-index berapa pun — dan membuat SELURUH dokumen di luar
     dialog INERT (terlihat tapi tak bisa diklik); showModal() juga memaksa
     menutup semua popover yang terbuka. Strateginya dua lapis:
     1. rehomeHost() — saat ada modal, pindahkan widget menjadi anak dialog
        (keturunan dialog kebal inert); saat modal tertutup, kembali ke <html>.
     2. showTopLayer()/assertTop() — promosikan widget ke top layer lewat
        Popover API supaya render di atas isi dialog & backdrop, dan angkat
        lagi ke puncak bila ada yang menutupi. Browser tanpa Popover API
        tetap berjalan lewat re-parenting + z-index. */
  const TOP_CHECK_MS = 700; // interval penjaga posisi & top layer

  function canEnterTopLayer() {
    return !!host && typeof host.showPopover === 'function';
  }

  function showTopLayer() {
    if (!canEnterTopLayer()) return;
    try {
      host.hidePopover(); // lepaskan dulu bila sedang terbuka…
    } catch {
      /* sebagian implementasi menolak hide saat memang tertutup */
    }
    try {
      host.showPopover(); // …lalu masuk lagi di urutan paling atas
    } catch {
      /* gagal naik — z-index max tetap jadi lapisan cadangan */
    }
  }

  /* Dialog modal aktif (yang terakhir di DOM). :modal hanya cocok untuk
     dialog showModal() — dialog show()/open biasa tidak membuat halaman
     inert sehingga tidak perlu ditumpangi. */
  const HAS_MODAL_SELECTOR = (() => {
    try {
      return CSS.supports('selector(dialog:modal)');
    } catch {
      return false;
    }
  })();

  function activeModalDialog() {
    const sel = HAS_MODAL_SELECTOR ? 'dialog:modal' : 'dialog[open]';
    const list = document.querySelectorAll(sel);
    return list.length ? list[list.length - 1] : null;
  }

  function rehomeHost() {
    if (!host) return;
    if (!host.isConnected) {
      document.documentElement.appendChild(host); // node tertelan swap halaman — pakai lagi
    }
    const target = activeModalDialog() || document.documentElement;
    if (host.parentElement !== target) {
      target.appendChild(host); // appendChild memindahkan node beserta shadow-nya
      showTopLayer(); // langsung naik, jangan menunggu interval
    }
  }

  function assertTop() {
    if (!host || pDown || document.visibilityState !== 'visible') return;
    rehomeHost();
    if (!canEnterTopLayer()) return;
    const r = fab.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (hit && hit !== host) showTopLayer(); // ada yang menutupi tombol FP
  }

  const CSS = `
    .qa-fab {
      position: absolute; left: 0; top: 0; width: 44px; height: 44px; padding: 0;
      border: none; border-radius: 50%;
      background: linear-gradient(135deg, #2563eb, #16a34a); color: #fff;
      font: 700 13px/44px "Segoe UI", system-ui, sans-serif; text-align: center;
      cursor: pointer; box-shadow: 0 2px 12px rgba(0, 0, 0, .3);
      user-select: none; -webkit-user-select: none; touch-action: none;
    }
    .qa-fab:hover { filter: brightness(1.1); }
    .qa-panel {
      position: absolute; right: 0; bottom: 54px; width: 330px; max-height: 62vh;
      display: flex; flex-direction: column; overflow: hidden;
      background: #fff; color: #1f2937; border-radius: 12px;
      box-shadow: 0 10px 34px rgba(0, 0, 0, .28);
      font: 13px/1.45 "Segoe UI", system-ui, sans-serif; text-align: left;
    }
    .qa-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px; background: #111827; color: #fff; font-weight: 700;
    }
    .qa-head button { background: none; border: none; color: #fff; font-size: 14px; cursor: pointer; }
    .qa-head-btns { display: flex; align-items: center; gap: 6px; }
    .qa-body { overflow-y: auto; padding: 8px; }
    .qa-search { padding: 8px 8px 2px; }
    .qa-search input {
      width: 100%; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px;
      font: inherit; box-sizing: border-box;
    }
    .qa-search input:focus {
      border-color: #2563eb; outline: none; box-shadow: 0 0 0 2px rgba(37, 99, 235, .25);
    }
    .qa-empty { color: #6b7280; text-align: center; padding: 14px 6px; }
    details.grp { margin-bottom: 4px; }
    details.grp > summary {
      cursor: pointer; font-weight: 700; font-size: 12px; color: #374151;
      padding: 5px 4px; border-radius: 6px; user-select: none;
    }
    details.grp > summary:hover { background: #f3f4f6; }
    .qa-badge {
      display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 999px;
      background: #16a34a; color: #fff; font-size: 10px; font-weight: 700;
    }
    .qa-item {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 7px 9px; margin: 2px 0; border: 1px solid #e5e7eb; border-radius: 8px;
    }
    .qa-item.matched { border-color: #16a34a; background: #f0fdf4; }
    .qa-name { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .qa-meta { display: block; color: #6b7280; font-size: 11px; font-weight: 400; }
    .qa-fill {
      padding: 5px 13px; border: none; border-radius: 6px; background: #16a34a;
      color: #fff; font-weight: 600; cursor: pointer; flex-shrink: 0; font-size: 12px;
    }
    .qa-fill:hover { background: #15803d; }
    .qa-foot {
      border-top: 1px solid #f0f0f1; padding: 8px 10px;
      display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
    }
    .qa-foot button {
      padding: 6px 9px; border: 1px solid #d1d5db; border-radius: 7px;
      background: #fff; color: #1f2937; cursor: pointer; font-size: 12px; font-family: inherit;
    }
    .qa-foot .qa-primary { background: #2563eb; border-color: #2563eb; color: #fff; font-weight: 600; flex: 1; }
    .qa-result { padding: 0 10px 8px; font-size: 12px; color: #065f46; }
    .qa-result.warn { color: #92400e; }
    .qa-result.err { color: #991b1b; }
    .qa-cap { padding: 8px 10px; border-top: 1px solid #f0f0f1; }
    .qa-cap input {
      width: 100%; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px;
      margin-bottom: 6px; font: inherit; box-sizing: border-box;
    }
    .qa-cap-title {
      font-weight: 600; font-size: 12px; color: #111827; margin-bottom: 6px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .qa-cap-label {
      display: block; font-size: 11px; font-weight: 600; color: #374151; margin-bottom: 3px;
    }
    .qa-cap-info { color: #6b7280; font-size: 11px; margin-bottom: 8px; }
    .qa-cap-update { margin-bottom: 8px; }
    .qa-cap-update button {
      display: block; width: 100%; text-align: left; margin-bottom: 4px;
      padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px;
      background: #f9fafb; font: inherit; font-size: 12px; color: #1f2937;
      cursor: pointer; box-sizing: border-box;
    }
    .qa-cap-update button:hover { border-color: #2563eb; background: #eff6ff; }
  `;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function showResult(msg, kind) {
    resultEl.textContent = msg;
    resultEl.className = 'qa-result' + (kind && kind !== 'ok' ? ' ' + kind : '');
    resultEl.style.display = 'block';
  }

  /* ---------- gerbang enkripsi (vault) ---------- */

  /* Siapkan salinan fields sesuai mode: 'fill' → terdekripsi (butuh
     passphrase bila ada field terenkripsi); 'store' → field sensitif polos
     dienkripsi bila vault aktif. Return null berarti passphrase dibutuhkan
     tapi sesi belum terbuka — form passphrase dimunculkan dan aksi
     dilanjutkan otomatis setelah berhasil (lihat gated()). */
  async function prepareFields(fields, mode) {
    const copy = JSON.parse(JSON.stringify(fields || []));
    if (mode === 'fill') {
      if (!Vault.needsOpen(copy)) return copy;
      // Field tertanda terenkripsi tapi fitur enkripsi MATI — jangan tampilkan
      // form passphrase (fitur nonaktif harus benar-benar pasif). Return false
      // = sinyal ke gated() untuk menampilkan penjelasan, bukan form.
      if (!(await Vault.isActive())) return false;
      if (!vaultPassOpen) return null;
      await Vault.unlock(vaultPassOpen); // sinkron dengan vault terkini
      await Vault.openFields(copy);
      return copy;
    }
    if ((await Vault.isActive()) && Vault.hasPlainSensitive(copy)) {
      if (!vaultPassOpen) return null;
      await Vault.unlock(vaultPassOpen);
      await Vault.sealFields(copy);
    }
    return copy;
  }

  /* Jalankan fn(fields) lewat prepareFields; bila passphrase dibutuhkan,
     tampilkan form dan tunda fn sampai passphrase terverifikasi. */
  function gated(fields, mode, fn) {
    prepareFields(fields, mode)
      .then(async (copy) => {
        if (copy === null) {
          vaultAction = () => gated(fields, mode, fn);
          showVaultForm(
            mode === 'fill'
              ? 'Profile ini punya field terenkripsi — masukkan passphrase untuk Fill.'
              : 'Enkripsi aktif — masukkan passphrase untuk menyimpan field password.'
          );
          return;
        }
        if (copy === false) {
          showResult(
            'Profil ini punya field terenkripsi, tapi enkripsi NONAKTIF — nilai lama tidak bisa dibuka. ' +
              'Buka ⚙ Kelola → Edit, isi ulang nilai password-nya (tersimpan polos), atau aktifkan lagi enkripsinya.',
            'warn'
          );
          return;
        }
        await fn(copy);
      })
      .catch((e) => {
        if (/Passphrase salah/.test(e.message)) vaultPassOpen = null; // sesi basi
        showResult('Gagal: ' + e.message, 'err');
      });
  }

  /* Form passphrase dibuat LAZY (saat pertama kali diminta), bukan saat
     widget lahir. Alasan: input type="password" yang selalu ada di DOM
     membuat password manager browser mengira halaman punya form login —
     kredensial tersimpan jadi menempel ke field search dsb. Dengan lazy,
     field password hanya ada di halaman saat passphrase benar-benar diminta.
     autocomplete="new-password" = penanda tambahan "ini bukan field login". */
  function ensureVaultForm() {
    if (vaultWrap) return;
    vaultWrap = el('div', 'qa-cap');
    vaultWrap.style.display = 'none';
    vaultMsg = el('div', 'qa-cap-title', '🔐 Passphrase');
    vaultInput = document.createElement('input');
    vaultInput.type = 'password';
    vaultInput.autocomplete = 'new-password';
    vaultInput.placeholder = 'Passphrase enkripsi…';
    vaultInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') safeRun(submitVaultPass);
    });
    const vaultRow = el('div', 'qa-foot');
    vaultRow.style.borderTop = 'none';
    const vaultGo = el('button', 'qa-primary', 'Buka & lanjutkan');
    vaultGo.type = 'button';
    vaultGo.addEventListener('click', () => safeRun(submitVaultPass));
    vaultRow.appendChild(vaultGo);
    vaultWrap.append(vaultMsg, vaultInput, vaultRow);
    panel.insertBefore(vaultWrap, resultEl); // posisi: setelah form capture
  }

  function showVaultForm(msg) {
    ensureVaultForm();
    vaultMsg.textContent = msg;
    vaultWrap.style.display = 'block';
    vaultInput.value = '';
    vaultInput.focus();
  }

  async function submitVaultPass() {
    const pass = vaultInput.value;
    if (!pass) return;
    if (!Vault.subtleOk()) {
      showResult('Web Crypto tidak tersedia (halaman harus https).', 'err');
      return;
    }
    try {
      await Vault.unlock(pass);
    } catch (e) {
      showResult(e.message, 'err');
      return;
    }
    vaultPassOpen = pass;
    vaultInput.value = '';
    vaultWrap.style.display = 'none';
    showResult('Sesi keamanan terbuka.', 'ok');
    const a = vaultAction;
    vaultAction = null;
    if (a) a(); // lanjutkan aksi yang tadi tertunda
  }

  /* ---------- posisi & drag tombol QA ---------- */

  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
  }

  function applyDefaultPos() {
    if (!host) return;
    host.style.left = 'auto';
    host.style.top = 'auto';
    host.style.right = EDGE + 'px';
    host.style.bottom = EDGE + 'px';
  }

  function applyPos(pos) {
    if (!host) return;
    const left = clamp(Number(pos.left) || 0, 0, window.innerWidth - FAB_SIZE);
    const top = clamp(Number(pos.top) || 0, 0, window.innerHeight - FAB_SIZE);
    host.style.right = 'auto';
    host.style.bottom = 'auto';
    host.style.left = left + 'px';
    host.style.top = top + 'px';
  }

  function currentPos() {
    const r = fab.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top) };
  }

  function applyDragState() {
    if (!fab || !geserBtn) return;
    geserBtn.textContent = dragEnabled ? '🔓 Geser: ON' : '🔒 Geser: OFF';
    fab.style.cursor = dragEnabled ? 'grab' : 'pointer';
  }

  function onFabPointerDown(e) {
    if (e.button !== 0) return;
    pDown = { x: e.clientX, y: e.clientY, moved: false, grabDX: 0, grabDY: 0 };
    if (!dragEnabled) return;
    try {
      fab.setPointerCapture(e.pointerId);
    } catch {
      /* tanpa capture pun drag tetap jalan selama pointer di atas fab */
    }
    e.preventDefault(); // cegah seleksi teks saat menarik
  }

  function onFabPointerMove(e) {
    if (!pDown || !dragEnabled) return;
    const dx = e.clientX - pDown.x;
    const dy = e.clientY - pDown.y;
    if (!pDown.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      pDown.moved = true;
      fab.style.cursor = 'grabbing';
      const r = fab.getBoundingClientRect();
      pDown.grabDX = pDown.x - r.left;
      pDown.grabDY = pDown.y - r.top;
      host.style.right = 'auto';
      host.style.bottom = 'auto';
    }
    const left = clamp(e.clientX - pDown.grabDX, 0, window.innerWidth - FAB_SIZE);
    const top = clamp(e.clientY - pDown.grabDY, 0, window.innerHeight - FAB_SIZE);
    host.style.left = left + 'px';
    host.style.top = top + 'px';
  }

  function onFabPointerUp() {
    if (!pDown) return;
    const moved = pDown.moved;
    pDown = null;
    fab.style.cursor = dragEnabled ? 'grab' : 'pointer';
    if (dragEnabled && moved) {
      suppressClick = true; // jangan anggap ini klik
      DB.setWidgetPos(currentPos());
    }
  }

  function onFabPointercancel() {
    pDown = null;
    if (fab) fab.style.cursor = dragEnabled ? 'grab' : 'pointer';
  }

  function onFabClick() {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    safeRun(toggle);
  }

  /* ---------- render daftar ---------- */

  /* Gabungan teks yang dicari: nama, grup, tag, URL pattern, catatan,
     serta label + nilai field — sama seperti filter di halaman Kelola. */
  function hayOf(p) {
    let hay = (p.name || '') + ' ' + (p.group || '').trim() + ' ' + (p.tags || []).join(' ');
    hay += ' ' + (p.urlPattern || '') + ' ' + (p.notes || '');
    for (const f of p.fields || []) {
      hay += ' ' + (f.label || '') + ' ' + (Array.isArray(f.value) ? f.value.join(' ') : String(f.value ?? ''));
    }
    return hay.toLowerCase();
  }

  function currentQuery() {
    return searchInput ? searchInput.value.trim().toLowerCase() : '';
  }

  async function renderList() {
    const profiles = (await DB.getProfiles()).filter((p) => !p.archived);
    const url = location.href;
    const q = currentQuery();
    // Saat mencari, grup hanya memuat profile yang cocok; tanpa pencarian
    // perilakunya persis seperti sebelumnya.
    const groups = DB.groupProfiles(
      q ? profiles.filter((p) => hayOf(p).includes(q)) : profiles,
      url,
      await DB.getGroups()
    );

    listEl.innerHTML = '';
    try {
      dlEl.innerHTML = '';
      for (const n of await DB.allGroupNames()) {
        const o = document.createElement('option');
        o.value = n;
        dlEl.appendChild(o);
      }
    } catch {
      /* datalist hanya bonus */
    }

    if (!groups.length) {
      listEl.appendChild(
        el(
          'div',
          'qa-empty',
          q
            ? 'Tidak ada profile yang cocok dengan "' + searchInput.value.trim() + '".'
            : 'Belum ada profile. Isi form dulu, lalu klik "Capture form ini".'
        )
      );
      return;
    }

    // Pengaturan "grup sesuai URL": sembunyikan grup yang tidak punya
    // profile yang cocok dengan halaman aktif (default ON). Saat sedang
    // mencari, filter ini DIABAIKAN agar profile tersembunyi pun ditemukan.
    let visible = groups;
    if (!q && (await DB.getShowUrlMatchedOnly())) {
      visible = groups.filter((g) => g.items.some((p) => DB.isMatch(p.urlPattern, url)));
      if (!visible.length) {
        listEl.appendChild(
          el(
            'div',
            'qa-empty',
            'Tidak ada grup yang cocok dengan halaman ini. (Filter "grup sesuai URL" aktif — matikan di ⚙ Kelola → Pengaturan.)'
          )
        );
        return;
      }
    }

    const uiState = await DB.getGroupUiState();
    for (const g of visible) {
      const det = document.createElement('details');
      det.className = 'grp';
      // Saat mencari, grup berisi hasil selalu dibuka agar hasilnya langsung terlihat.
      det.open = q
        ? true
        : Object.prototype.hasOwnProperty.call(uiState, g.name)
          ? !!uiState[g.name]
          : groups.length <= 4;
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
      const sum = el('summary', null, g.name + ' (' + g.items.length + ')');
      if (anyMatch) sum.appendChild(el('span', 'qa-badge', 'match'));
      det.appendChild(sum);

      for (const p of g.items) {
        const row = el('div', 'qa-item' + (DB.isMatch(p.urlPattern, url) ? ' matched' : ''));
        const main = el('div');
        main.style.minWidth = '0';
        main.appendChild(el('div', 'qa-name', p.name));
        main.appendChild(el('span', 'qa-meta', (p.fields ? p.fields.length : 0) + ' field'));
        const btn = el('button', 'qa-fill', 'Fill');
        btn.type = 'button';
        btn.addEventListener('click', () => safeRun(() => doFill(p)));
        row.append(main, btn);
        det.appendChild(row);
      }
      listEl.appendChild(det);
    }
  }

  /* ---------- fill & capture ---------- */

  /* Hapus highlight capture — aman dipanggil kapan pun (agent selalu ada
     karena termasuk content script manifest). */
  function clearCapHighlight() {
    try {
      if (window.__qaFormAgent) window.__qaFormAgent.clearCaptureHighlight();
    } catch {
      /* visual saja — gagal bersih diabaikan */
    }
  }

  async function doFill(p) {
    gated(p.fields, 'fill', (fields) => performFill(p, fields));
  }

  async function performFill(p, fields) {
    const api = window.__qaFormAgent;
    if (!api) {
      showResult('Agent belum siap — muat ulang halaman lalu coba lagi.', 'err');
      return;
    }
    const values = (fields || []).map((f) => ({
      ...f,
      value: typeof f.value === 'string' ? resolvePlaceholders(f.value) : f.value,
    }));
    const res = api.fill(values);
    const skipped = res.skipped || 0;
    const fails = res.results
      .filter((r) => !r.ok && !r.skipped)
      .map((r) => (r.label || r.selector) + (r.reason ? ' — ' + r.reason : ''));
    let msg = '✔ ' + res.filled + ' field terisi.';
    if (skipped) msg += ' ⏭ ' + skipped + ' diisi manual (upload file).';
    if (res.failed) msg += ' ✖ ' + res.failed + ' gagal: ' + fails.join(', ');
    showResult(msg, res.failed === 0 ? 'ok' : 'warn');
    try {
      await DB.addLog({
        id: DB.uid(),
        ts: Date.now(),
        url: location.href,
        profileId: p.id,
        profileName: p.name,
        filled: res.filled,
        skipped,
        failedFields: fails,
      });
    } catch {
      /* log gagal tidak boleh menggagalkan fill */
    }
  }

  async function startCapture() {
    const api = window.__qaFormAgent;
    if (!api) {
      showResult('Agent belum siap — muat ulang halaman lalu coba lagi.', 'err');
      return;
    }
    const data = await api.capture();
    if (!data.count) {
      showResult(
        data.scopedModal
          ? 'Modal terbuka tapi belum ada field terisi di dalamnya — isi dulu field-nya, lalu Capture lagi.'
          : 'Tidak ada field terisi yang terdeteksi di halaman ini.',
        'err'
      );
      return;
    }
    pending = data;
    capTitle.textContent = data.title || '(tanpa judul halaman)';
    capTitle.title = capTitle.textContent;
    const sens = data.fields.filter((f) => f.sensitive).length;
    capInfo.textContent =
      data.count + ' field terdeteksi' +
      (sens ? ' — termasuk ' + sens + ' field password (tersimpan apa adanya)' : '') +
      '.';
    capName.value = (data.title || '').slice(0, 60) || 'Profile baru';
    try {
      capGroup.value = new URL(location.href).hostname;
    } catch {
      capGroup.value = '';
    }
    let cands = [];
    try {
      cands = await DB.findUpdateCandidates(location.href, data.fields);
    } catch {
      /* kandidat update opsional — jangan ganggu capture */
    }
    renderUpdateCandidates(cands);
    capWrap.style.display = 'block';
    capName.focus();
  }

  /* Tombol "Perbarui" hanya muncul bila ada profile serupa (URL cocok +
     ada field yang sama); capture fresh tidak menampilkan tombol ini. */
  function renderUpdateCandidates(cands) {
    capUpd.innerHTML = '';
    if (!cands.length) {
      capUpd.style.display = 'none';
      return;
    }
    capUpd.appendChild(el('div', 'qa-cap-label', 'Profile serupa terdeteksi — perbarui?'));
    for (const c of cands.slice(0, 5)) {
      const b = el('button', null, '🔄 ' + c.profile.name + ' (' + c.overlap + ' field sama)');
      b.type = 'button';
      b.title = 'Timpa field profile ini dengan hasil capture sekarang';
      b.addEventListener('click', () => safeRun(() => updateProfile(c.profile.id)));
      capUpd.appendChild(b);
    }
    capUpd.style.display = 'block';
  }

  async function updateProfile(id) {
    if (!pending) return;
    const p = (await DB.getProfiles()).find((x) => x.id === id);
    if (!p) return;
    gated(pending.fields, 'store', (fields) => finishUpdateProfile(p, fields));
  }

  async function finishUpdateProfile(p, fields) {
    p.fields = fields;
    p.updatedAt = Date.now();
    await DB.upsertProfile(p);
    pending = null;
    clearCapHighlight();
    capUpd.style.display = 'none';
    capWrap.style.display = 'none';
    await renderList();
    showResult('Profile "' + p.name + '" diperbarui (' + p.fields.length + ' field).', 'ok');
  }

  async function saveCapture() {
    if (!pending) return;
    const name = await DB.uniqueName(
      capName.value.trim() || 'Profile ' + new Date().toLocaleString()
    );
    let pattern = '';
    try {
      pattern = new URL(location.href).origin + '/**';
    } catch {
      /* url tidak valid */
    }
    gated(pending.fields, 'store', (fields) => finishSaveCapture(name, pattern, fields));
  }

  async function finishSaveCapture(name, pattern, fields) {
    const now = Date.now();
    await DB.addProfile({
      id: DB.uid(),
      name,
      group: capGroup.value.trim(),
      urlPattern: pattern,
      tags: [],
      notes: '',
      archived: false,
      createdAt: now,
      updatedAt: now,
      fields,
    });
    pending = null;
    clearCapHighlight();
    capWrap.style.display = 'none';
    await renderList();
    showResult('Profile tersimpan.', 'ok');
  }

  /* ---------- toggle & lifecycle ---------- */

  async function toggle() {
    if (panel.style.display === 'none') {
      // Panel membuka ke arah yang aman mengikuti posisi tombol.
      const r = fab.getBoundingClientRect();
      if (r.left < 350) {
        panel.style.left = '0px';
        panel.style.right = 'auto';
      } else {
        panel.style.left = 'auto';
        panel.style.right = '0px';
      }
      if (r.top < 300) {
        panel.style.top = FAB_SIZE + 10 + 'px';
        panel.style.bottom = 'auto';
      } else {
        panel.style.top = 'auto';
        panel.style.bottom = FAB_SIZE + 10 + 'px';
      }
      panel.style.display = 'flex';
      resultEl.style.display = 'none';
      capWrap.style.display = 'none';
      capUpd.style.display = 'none';
      if (vaultWrap) vaultWrap.style.display = 'none'; // belum dibuat = tidak ada yang perlu disembunyikan
      clearCapHighlight(); // form capture lama sudah tidak terbuka lagi
      await renderList();
      searchInput.focus();
    } else {
      panel.style.display = 'none';
      clearCapHighlight();
      // Reset pencarian agar panel yang dibuka berikutnya menampilkan
      // daftar penuh, bukan sisa filter yang sudah lupa.
      searchInput.value = '';
    }
  }

  async function disable() {
    await DB.setWidgetEnabled(false);
    if (host) {
      host.remove();
      host = null;
    }
  }

  function ensureWidget() {
    if (host) return;

    host = document.createElement('div');
    host.style.cssText =
      'all:initial; position:fixed; width:' + FAB_SIZE + 'px; height:' + FAB_SIZE + 'px;' +
      'right:' + EDGE + 'px; bottom:' + EDGE + 'px; z-index:2147483647;';
    /* popover="manual" = tiket masuk top layer browser (lihat showTopLayer).
       all:initial di atas sekalian menetralkan style UA milik popover
       (display:none saat tertutup, inset/margin auto saat terbuka). */
    if (typeof host.showPopover === 'function') host.popover = 'manual';
    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);

    panel = el('div', 'qa-panel');
    panel.style.display = 'none';

    const head = el('div', 'qa-head');
    head.appendChild(el('span', null, '⚡ FormPilot'));
    // ⚙ dan ✕ digroup di kanan agar ⚙ tidak terdorong ke tengah header
    const headBtns = el('div', 'qa-head-btns');
    const optsBtn = el('button', null, '⚙');
    optsBtn.type = 'button';
    optsBtn.title = 'Pengaturan / Kelola profile';
    optsBtn.addEventListener('click', () => {
      try {
        chrome.runtime.sendMessage({ type: 'QA_OPEN_OPTIONS' });
      } catch {
        /* fallback: buka langsung lewat URL extension */
        window.open(chrome.runtime.getURL('options/options.html'), '_blank');
      }
    });
    headBtns.appendChild(optsBtn);
    const close = el('button', null, '✕');
    close.type = 'button';
    close.title = 'Tutup panel';
    close.addEventListener('click', () => safeRun(toggle));
    headBtns.appendChild(close);
    head.appendChild(headBtns);

    // Kotak pencarian di atas daftar — tetap terlihat saat daftar discroll.
    const searchWrap = el('div', 'qa-search');
    searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.autocomplete = 'off';
    searchInput.placeholder = '🔍 Cari nama / grup / tag / field…';
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => safeRun(renderList), 150); // debounce ketikan
    });
    searchWrap.appendChild(searchInput);

    listEl = el('div', 'qa-body');
    resultEl = el('div', 'qa-result');
    resultEl.style.display = 'none';

    capWrap = el('div', 'qa-cap');
    capWrap.style.display = 'none';
    capTitle = el('div', 'qa-cap-title');
    const lblName = el('label', 'qa-cap-label', 'Nama profile');
    capName = document.createElement('input');
    capName.id = 'qa-cap-name';
    lblName.setAttribute('for', 'qa-cap-name');
    capName.type = 'text';
    capName.autocomplete = 'off';
    capName.placeholder = 'Nama profile…';
    capName.maxLength = 80;
    capGroup = document.createElement('input');
    capGroup.type = 'text';
    capGroup.autocomplete = 'off';
    capGroup.placeholder = 'Grup (mis. nama app / domain)';
    capGroup.maxLength = 60;
    const lblGroup = el('label', 'qa-cap-label', 'Grup');
    capGroup.id = 'qa-cap-group';
    lblGroup.setAttribute('for', 'qa-cap-group');
    dlEl = document.createElement('datalist');
    dlEl.id = 'qa-group-list';
    capGroup.setAttribute('list', 'qa-group-list');
    const capRow = el('div', 'qa-foot');
    capRow.style.borderTop = 'none';
    const saveBtn = el('button', 'qa-primary', 'Simpan profile');
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', () => safeRun(saveCapture));
    const cancelBtn = el('button', null, 'Batal');
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', () => {
      pending = null;
      vaultAction = null; // batal juga batalkan aksi yang menunggu passphrase
      vaultWrap.style.display = 'none';
      clearCapHighlight();
      capUpd.style.display = 'none';
      capWrap.style.display = 'none';
    });
    capInfo = el('div', 'qa-cap-info');
    capUpd = el('div', 'qa-cap-update');
    capUpd.style.display = 'none';
    capRow.append(saveBtn, cancelBtn);
    capWrap.append(capTitle, lblName, capName, lblGroup, capGroup, dlEl, capInfo, capUpd, capRow);

    const foot = el('div', 'qa-foot');
    const capBtn = el('button', 'qa-primary', '📷 Capture');
    capBtn.type = 'button';
    capBtn.addEventListener('click', () => safeRun(startCapture));
    geserBtn = el('button', null, '🔒 Geser: OFF');
    geserBtn.type = 'button';
    geserBtn.title = 'Mode geser: ON = tombol bisa ditarik ke mana saja (posisi tersimpan), OFF = terkunci di pojok kanan bawah';
    geserBtn.addEventListener('click', () =>
      safeRun(async () => {
        const next = !dragEnabled;
        await DB.setWidgetDragEnabled(next);
        dragEnabled = next;
        if (!dragEnabled) {
          await DB.clearWidgetPos();
          applyDefaultPos();
        }
        applyDragState();
        showResult(
          dragEnabled
            ? 'Mode geser AKTIF — tarik tombol QA ke posisi mana saja.'
            : 'Mode geser MATI — tombol kembali terkunci di pojok kanan bawah.',
          'ok'
        );
      })
    );
    const offBtn = el('button', null, 'Nonaktifkan');
    offBtn.type = 'button';
    offBtn.title = 'Sembunyikan panel ini (aktifkan lagi dari halaman Kelola)';
    offBtn.addEventListener('click', () => safeRun(disable));
    foot.append(capBtn, geserBtn, offBtn);

    panel.append(head, searchWrap, listEl, capWrap, resultEl, foot);
    shadow.appendChild(panel);

    fab = el('button', 'qa-fab');
    fab.type = 'button';
    fab.textContent = 'FP';
    fab.title = 'FormPilot';
    fab.addEventListener('pointerdown', onFabPointerDown);
    fab.addEventListener('pointermove', onFabPointerMove);
    fab.addEventListener('pointerup', onFabPointerUp);
    fab.addEventListener('pointercancel', onFabPointercancel);
    fab.addEventListener('click', onFabClick);
    shadow.appendChild(fab);

    // Tempel di <html>, bukan <body> — bebas dari stacking context /
    // transform level body yang bisa menjebak widget di bawah overlay.
    document.documentElement.appendChild(host);
    showTopLayer();
    applyDragState();
  }

  /* Sinkron live dengan perubahan setting dari halaman Kelola / panel lain. */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (!extValid()) {
      teardownStale();
      return;
    }
    try {
      if (area !== 'local') return;
      if (changes.widgetEnabled) {
        if (!changes.widgetEnabled.newValue && host) {
          host.remove();
          host = null;
        } else if (changes.widgetEnabled.newValue && !host) {
          ensureWidget();
        }
      }
      if (changes.widgetDragEnabled && host) {
        dragEnabled = !!changes.widgetDragEnabled.newValue;
        if (!dragEnabled) {
          DB.clearWidgetPos();
          applyDefaultPos();
        }
        applyDragState();
      }
    } catch (e) {
      if (!extValid()) teardownStale();
    }
  });

  setInterval(assertTop, TOP_CHECK_MS);

  /* Reaksi instan tanpa menunggu interval: event "close" tidak membubble
     tapi tetap tertangkap lewat capture; pembukaan dialog tidak punya
     event sendiri, jadi diamati lewat perubahan atribut open di dokumen. */
  document.addEventListener('close', () => rehomeHost(), true);
  new MutationObserver(rehomeHost).observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['open'],
  });

  safeRun(async () => {
    const on = await DB.getWidgetEnabled();
    if (!on) return;
    ensureWidget();
    dragEnabled = await DB.getWidgetDragEnabled();
    applyDragState();
    if (dragEnabled) {
      const pos = await DB.getWidgetPos();
      if (pos) applyPos(pos);
    }
  });
})();
