/* FormPilot — Auto Fill engine.
   Mengisi form OTOMATIS saat halaman cocok dengan profile yang DI-PIN
   (p.autoPin) — tanpa menekan Fill. Kebijakan (lihat card ⚡ Auto Fill di
   halaman Kelola):
   - mode 'ask'  (default): toast konfirmasi di halaman → user klik Isi
   - mode 'auto'          : langsung isi, tanpa tanya
   - mode 'off'           : tidak ada aktivitas
   Konflik beberapa kandidat: skor = fraksi field profile yang ditemukan di
   halaman. Auto hanya memilih sendiri bila juara JELAS MENANG (skor ≥
   ambang DAN selisih ≥ MARGIN dari runner-up, atau kandidat tunggal);
   kalau ambigu → SELALU ditanya via toast, tidak pernah menebak.
   Aturan baku: field yang sudah terisi TIDAK PERNAH ditimpa; profile dengan
   field terenkripsi (vault) dikecualikan.
   Bergantung global di world yang sama: DB, resolvePlaceholders, Gen,
   window.__qaFormAgent (fill/planFill/lastAction). */

(() => {
  if (window.__qaAutoFill) return; // idempotent

  const MARGIN = 0.15; // selisih skor minimal juara vs runner-up (poin 0–1)
  const LADDER = [400, 1200, 3000]; // percobaan awal setelah halaman dibuka
  const MAX_ATTEMPTS = 8; // cap percobaan per URL (anti-loop)
  const OBS_DEBOUNCE = 800;
  const RESULT_TTL = 4000; // toast hasil fill (mini) — selalu singkat

  /* Cache setting+profile; diinisialisasi 'off' — engine diam sampai data
     berhasil dibaca dari storage (tidak pernah bertindak buta). */
  let cache = {
    mode: 'off',
    minScore: 60,
    allowMulti: true,
    profiles: [],
    toastMode: 'timer', // 'timer' = hilang sendiri | 'sticky' = sampai ditutup
    toastSeconds: 30, // durasi mode timer (default 30 detik)
    toastPos: null, // {left, top} hasil geseran user — null = pojok kanan atas
  };
  let state = null; // per-URL: { url, attempts, armedAt, done:Set, dismissed, offered }
  let running = false; // sedang mengeksekusi fill — tolak evaluasi lain
  let userTyped = false; // user keburu mengetik di form → auto batal
  let urlSeen = location.href;
  let obsTimer = null;
  let toastEl = null;
  let toastTimer = null;

  function extValid() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  async function refreshCache() {
    try {
      const [mode, minScore, allowMulti, profiles, toastMode, toastSeconds, toastPos] =
        await Promise.all([
          DB.getAutoFillMode(),
          DB.getAutoFillMinScore(),
          DB.getAutoFillAllowMulti(),
          DB.getProfiles(),
          DB.getAutoFillToastMode(),
          DB.getAutoFillToastSeconds(),
          DB.getAutoFillToastPos(),
        ]);
      cache = { mode, minScore, allowMulti, profiles: profiles || [], toastMode, toastSeconds, toastPos };
    } catch {
      /* storage gagal — pertahankan cache sebelumnya */
    }
  }

  /* ---------- toast (independen dari widget) ---------- */

  function ensureToastStyle() {
    if (document.getElementById('qa-af-style')) return;
    const st = document.createElement('style');
    st.id = 'qa-af-style';
    st.textContent =
      '.qa-af-toast{position:fixed;top:14px;right:14px;z-index:2147483647;background:#111827;color:#fff;' +
      'padding:10px 12px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.35);' +
      'font:12px/1.45 system-ui,sans-serif;max-width:320px;}' +
      '.qa-af-toast.qa-af-moved{right:auto !important;cursor:grab;}' +
      '.qa-af-toast.qa-af-dragging{cursor:grabbing !important;user-select:none;}' +
      '.qa-af-toast.qa-af-mini{padding:8px 12px;}' +
      '.qa-af-title{font-weight:700;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;' +
      'white-space:nowrap;max-width:290px;}' +
      '.qa-af-sub{color:#d1d5db;margin-bottom:8px;}' +
      '.qa-af-row{display:flex;gap:6px;}' +
      '.qa-af-toast button{cursor:pointer;border:1px solid #4b5563;background:#1f2937;color:#fff;' +
      'border-radius:7px;padding:5px 10px;font:12px system-ui,sans-serif;}' +
      '.qa-af-toast button:hover{border-color:#9ca3af;}' +
      '.qa-af-toast .qa-af-yes{background:#f59e0b;border-color:#f59e0b;color:#111827;font-weight:700;flex:1;}' +
      '.qa-af-toast .qa-af-yes:hover{background:#d97706;}' +
      '.qa-af-opt{display:block;width:100%;text-align:left;margin-top:6px;}';
    (document.head || document.documentElement).appendChild(st);
  }

  function hideToast() {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (toastEl) {
      toastEl.remove();
      toastEl = null;
    }
  }

  /* Geser toast ke mana saja — posisi tersimpan di storage dan bertahan
     antar halaman & refresh. Pointerdown pada tombol tidak memulai drag
     (tombol tetap klik biasa); geseran di bawah 5px dianggap klik. */
  function attachDrag(el) {
    let sx = 0;
    let sy = 0;
    let startLeft = 0;
    let startTop = 0;
    let moved = false;
    let dragging = false;

    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true;
      el.classList.add('qa-af-moved', 'qa-af-dragging');
      el.style.left = Math.min(Math.max(0, startLeft + dx), window.innerWidth - el.offsetWidth) + 'px';
      el.style.top = Math.min(Math.max(0, startTop + dy), window.innerHeight - el.offsetHeight) + 'px';
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      dragging = false;
      el.classList.remove('qa-af-dragging');
      if (moved) {
        cache.toastPos = { left: el.offsetLeft, top: el.offsetTop };
        DB.setAutoFillToastPos(cache.toastPos).catch(() => {});
      }
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      dragging = true;
      moved = false;
      sx = e.clientX;
      sy = e.clientY;
      const r = el.getBoundingClientRect();
      startLeft = r.left;
      startTop = r.top;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* tanpa capture pun drag tetap jalan selama pointer di atas toast */
      }
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    });
  }

  function showToast(build, ttlOverride) {
    if (!document.body) return;
    ensureToastStyle();
    hideToast();
    toastEl = document.createElement('div');
    toastEl.className = 'qa-af-toast';
    build(toastEl);
    document.body.appendChild(toastEl);

    // Posisi tersimpan dari geseran sebelumnya — dipakai ulang & clamp
    // ke dalam viewport (aman saat resolusi layar berubah).
    if (cache.toastPos) {
      const w = toastEl.offsetWidth || 0;
      const h = toastEl.offsetHeight || 0;
      const left = Math.min(Math.max(0, cache.toastPos.left), Math.max(0, window.innerWidth - w));
      const top = Math.min(Math.max(0, cache.toastPos.top), Math.max(0, window.innerHeight - h));
      toastEl.classList.add('qa-af-moved');
      toastEl.style.left = left + 'px';
      toastEl.style.top = top + 'px';
    }
    attachDrag(toastEl);

    // Durasi: toast hasil fill selalu singkat; toast aksi (konfirmasi/
    // pilihan) mengikuti setting — 'timer' N detik (default 30) atau
    // 'sticky' = tetap tampil sampai ditutup (tanpa timer).
    const ttl = ttlOverride
      ? ttlOverride
      : cache.toastMode === 'sticky'
        ? 0
        : Math.max(1, cache.toastSeconds) * 1000;
    if (ttl) toastTimer = setTimeout(hideToast, ttl);
  }

  function closeBtn(box, onDismiss) {
    const no = document.createElement('button');
    no.textContent = '✕';
    no.title = 'Tutup — jangan tanya lagi di halaman ini';
    no.addEventListener('click', () => {
      hideToast();
      if (state) state.dismissed = true;
      if (onDismiss) onDismiss();
    });
    return no;
  }

  /* ---------- evaluasi & eksekusi ---------- */

  const hasEncrypted = (p) => (p.fields || []).some((f) => f.encrypted);

  async function executeFill(p) {
    const api = window.__qaFormAgent;
    if (!api || !state || running) return;
    running = true;
    state.done.add(p.id); // satu kali auto per profile per URL
    hideToast();
    try {
      const persona = window.Gen ? window.Gen.buildPersona() : null;
      const values = (p.fields || [])
        .filter((f) => !f.encrypted)
        .map((f) => ({
          ...f,
          value: typeof f.value === 'string' ? resolvePlaceholders(f.value, persona) : f.value,
        }));
      // Rencana ulang TEPAT sebelum isi: hanya field yang ketemu & KOSONG
      // (aturan baku — tidak pernah menimpa nilai yang sudah ada).
      const plan = api.planFill(values);
      const toFill = values.filter((_, i) => plan.perField[i] === 'empty');
      if (!toFill.length) return;

      const res = await api.fill(toFill, { internal: true });
      const fails = (res.results || [])
        .filter((r) => !r.ok && !r.skipped)
        .map((r) => (r.label || r.selector) + (r.reason ? ' — ' + r.reason : ''));
      try {
        await DB.addLog({
          id: DB.uid(),
          ts: Date.now(),
          url: location.href,
          profileId: p.id,
          profileName: p.name,
          filled: res.filled,
          skipped: res.skipped || 0,
          failedFields: fails,
          source: 'auto',
        });
      } catch {
        /* log gagal tidak boleh menggagalkan fill */
      }
      if (cache.mode === 'auto') {
        const msg =
          '⚡ ' + res.filled + ' field diisi otomatis — ' + p.name +
          (res.failed ? ' (' + res.failed + ' gagal)' : '');
        showToast((box) => {
          box.classList.add('qa-af-mini');
          box.textContent = msg;
        }, RESULT_TTL);
      }
    } finally {
      running = false;
    }
  }

  function toastConfirm(p, stats) {
    showToast((box) => {
      const title = document.createElement('div');
      title.className = 'qa-af-title';
      title.textContent = '⚡ Auto Fill: ' + p.name;
      const sub = document.createElement('div');
      sub.className = 'qa-af-sub';
      sub.textContent =
        stats.empty + ' field kosong siap diisi (' + Math.round(stats.score * 100) + '% cocok)';
      const row = document.createElement('div');
      row.className = 'qa-af-row';
      const yes = document.createElement('button');
      yes.className = 'qa-af-yes';
      yes.textContent = 'Isi sekarang';
      yes.addEventListener('click', () => executeFill(p));
      row.append(yes, closeBtn(box));
      box.append(title, sub, row);
    });
  }

  function toastPick(scored) {
    showToast((box) => {
      const title = document.createElement('div');
      title.className = 'qa-af-title';
      title.textContent = '⚡ ' + scored.length + ' profile cocok — pilih:';
      box.appendChild(title);
      for (const c of scored.slice(0, 4)) {
        const b = document.createElement('button');
        b.className = 'qa-af-opt';
        b.textContent = c.p.name + ' (' + Math.round(c.stats.score * 100) + '%)';
        b.addEventListener('click', () => executeFill(c.p));
        box.appendChild(b);
      }
      box.appendChild(closeBtn(box));
    });
  }

  async function evaluate() {
    if (!extValid() || running) return;
    if (cache.mode === 'off') return;
    const api = window.__qaFormAgent;
    if (!api || !api.fill || !api.planFill) return;

    const url = location.href;
    if (!state || state.url !== url) {
      // halaman baru / SPA pindah URL — reset state per-URL
      state = { url, attempts: 0, armedAt: Date.now(), done: new Set(), dismissed: false, offered: false };
    }
    if (state.dismissed || userTyped) return;
    if (state.attempts >= MAX_ATTEMPTS) return;

    // user berintervensi manual (fill/capture/generate) sejak arm → batal
    const act = api.lastAction();
    if ((act.lastFillAt || 0) > state.armedAt || (act.lastCaptureAt || 0) > state.armedAt) {
      state.dismissed = true;
      return;
    }

    const cands = cache.profiles.filter(
      (p) =>
        p.autoPin &&
        !p.archived &&
        !hasEncrypted(p) &&
        p.urlPattern &&
        DB.isMatch(p.urlPattern, url)
    );
    if (!cands.length) return; // tanpa pin — tidak menghitung percobaan
    state.attempts++;

    // Kandidat yang layak: belum pernah di-auto di URL ini, cukup cocok,
    // dan masih ada field kosong untuk diisi.
    const scored = [];
    for (const p of cands) {
      if (state.done.has(p.id)) continue;
      let stats;
      try {
        const raw = api.planFill(p.fields || []);
        const score = raw.total ? raw.resolved / raw.total : 0;
        if (raw.empty > 0 && score * 100 >= cache.minScore) {
          stats = { ...raw, score };
          scored.push({ p, stats, score });
        }
      } catch {
        /* halaman berubah di tengah jalan — coba lagi nanti */
      }
    }
    if (!scored.length) return;
    /* Urutan kandidat: skor tertinggi menang; seri → yang terakhir
       di-update menang (deterministik); masih seri → nama A-Z. */
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        (b.p.updatedAt || 0) - (a.p.updatedAt || 0) ||
        String(a.p.name).localeCompare(String(b.p.name), 'id')
    );
    const clearWin =
      scored.length === 1 ||
      (cache.allowMulti && scored[0].score - scored[1].score >= MARGIN);

    if (cache.mode === 'auto') {
      // Langsung isi TANPA tanya — apa pun hasil keputusannya (juara jelas
      // menang maupun seri; seri diambil skor tertinggi/terakhir di-update).
      await executeFill(scored[0].p);
    } else if (clearWin) {
      // Tanya dulu + juara jelas → satu toast konfirmasi
      if (!state.offered) {
        state.offered = true; // satu toast per URL — jangan mengganggu berulang
        toastConfirm(scored[0].p, scored[0].stats);
      }
    } else if (!state.offered) {
      // Tanya dulu + ambigu → daftar pilihan, tidak pernah menebak
      state.offered = true;
      toastPick(scored);
    }
  }

  function safeEvaluate() {
    if (!extValid() || !document.body) return;
    refreshCache()
      .then(evaluate)
      .catch(() => {});
  }

  /* ---------- pemicu ---------- */

  function resetAndRun() {
    state = null; // URL baru — reset seluruh state per-URL
    safeEvaluate();
    for (const ms of LADDER) setTimeout(safeEvaluate, ms);
  }

  // Tangga percobaan awal saat halaman dibuka
  refreshCache()
    .then(() => {
      safeEvaluate();
      for (const ms of LADDER) setTimeout(safeEvaluate, ms);
    })
    .catch(() => {});

  // Form yang dirender belakangan (SPA / lazy) — observer debounce
  const mo = new MutationObserver(() => {
    if (obsTimer) clearTimeout(obsTimer);
    obsTimer = setTimeout(() => {
      if (location.href !== urlSeen) {
        urlSeen = location.href;
        resetAndRun();
      } else {
        safeEvaluate();
      }
    }, OBS_DEBOUNCE);
  });
  if (document.documentElement) {
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  // Kembali dari back-forward cache (bfcache) — halaman hidup lagi
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) resetAndRun();
  });

  // User mulai mengetik di form → batalkan apa pun yang tertunda
  document.addEventListener(
    'keydown',
    (e) => {
      const t = e.target;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        if (!userTyped) {
          userTyped = true;
          hideToast();
        }
      }
    },
    true
  );

  // Setting/profile berubah (dari Kelola) → live tanpa reload halaman
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (
      changes.profiles ||
      changes.autoFillMode ||
      changes.autoFillMinScore ||
      changes.autoFillAllowMulti ||
      changes.autoFillToastMode ||
      changes.autoFillToastSeconds ||
      changes.autoFillToastPos
    ) {
      refreshCache()
        .then(evaluate)
        .catch(() => {});
    }
  });

  window.__qaAutoFill = { evaluate: safeEvaluate };
})();
