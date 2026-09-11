/* FormPilot — Content Agent
   Di-inject on-demand ke tab aktif (chrome.scripting.executeScript).
   Self-contained & idempotent. Komunikasi via chrome.runtime.onMessage:
   - QA_PING     -> cek keberadaan agent
   - QA_CAPTURE  -> scan field yang terisi -> kembalikan daftar field
   - QA_FILL     -> isi field sesuai daftar values */

(() => {
  if (window.__qaFormAgent) return;

  const FILLABLE = 'input, textarea, select';
  const SKIP_INPUT_TYPES = ['hidden', 'file', 'button', 'submit', 'reset', 'image'];

  function isVisible(el) {
    if (!el || !el.getClientRects().length) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  }

  function inputType(el) {
    if (el.tagName === 'TEXTAREA') return 'textarea';
    if (el.tagName === 'SELECT') return 'select';
    return (el.type || 'text').toLowerCase();
  }

  function isCapturable(el) {
    if (el.disabled) return false;
    const t = inputType(el);
    if (SKIP_INPUT_TYPES.includes(t)) return false;
    if (el.readOnly && t !== 'select') return false;
    return true;
  }

  /* ---------- widget select enhanced (TomSelect / Select2 / Choices) ---------- */

  /* Widget-family ini menyembunyikan field aslinya lalu membangun UI sendiri
     TEPAT SETELAH field tersebut. Konvensi kelas ketiganya dipakai apa adanya
     — tanpa selector spesifik halaman mana pun — supaya bekerja di web mana
     pun yang memakai widget sejenis. */
  const WIDGET_WRAP_SEL = '.ts-wrapper, .select2, .select2-container, .choices';

  function widgetWrapOf(el) {
    const sib = el.nextElementSibling;
    return sib && sib.matches(WIDGET_WRAP_SEL) ? sib : null;
  }

  /* Field dianggap terlihat bila dirinya ATAU widget penampilnya terlihat —
     field asli hasil enhance memang sengaja disembunyikan widget-nya
     (ts-hidden-accessible, d-none, dll) padahal nilainya tetap hidup di sana. */
  function isVisibleField(el) {
    return isVisible(el) || isVisible(widgetWrapOf(el));
  }

  /* Item terpilih menurut DOM widget — sumber nilai cadangan untuk field
     asli yang kosong (nilai multi/ajax kadang baru tersinkron saat submit). */
  function widgetItemsOf(el) {
    const wrap = widgetWrapOf(el);
    if (!wrap) return [];
    const nodes = wrap.querySelectorAll(
      '.item[data-value], .choices__item--selected[data-value], .select2-selection__choice'
    );
    const items = [];
    for (const n of nodes) {
      const clean = n.cloneNode(true);
      clean.querySelectorAll('.remove, svg, i, img').forEach((x) => x.remove());
      const text = (clean.textContent || '').replace(/\s+/g, ' ').trim();
      const value = n.getAttribute('data-value') || text;
      if (!value && !text) continue;
      items.push({ value, text });
    }
    return items;
  }

  /* Kirim rangkaian event mouse lengkap — tiap widget mendengarkan jenis
     berbeda (mousedown/mouseup/click) dan sebagian memakai delegasi ke
     wadah dropdown, jadi event dibuat bubbles. */
  function mouseBurst(target) {
    for (const type of ['mousedown', 'mouseup', 'click']) {
      target.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0 })
      );
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* Pilih nilai lewat UI widget, meniru alur user asli: buka dropdown-nya
     dulu, TUNGU isi dropdown selesai dirender (render TomSelect tidak
     sinkron — inilah sebabnya perlu retry beberapa tick; tanpa itu opsi
     baru ketemu pada klik Fill berikutnya), klik opsinya, lalu verifikasi.
     Return {ok, why} — why berisi titik gagalnya untuk diagnostik.
     Ini satu-satunya jalur yang menjamin tampilan widget ikut terisi:
     TomSelect dkk tidak mendengarkan event 'change' pada field asli —
     aliran datanya satu arah (widget → native). */
  /* Dropdown milik widget. Umumnya berada DI DALAM wrapper, tetapi TomSelect
     yang dikonfigurasi dengan dropdownParent merendernya DI LUAR wrapper
     (mis. di ujung <body>) dan hanya terhubung lewat aria-controls pada
     input control-nya — konvensi ARIA bawaan TomSelect, bukan selector
     halaman tertentu. */
  function widgetDropdownOf(wrap) {
    const dd = wrap.querySelector('.ts-dropdown, .choices__list--dropdown');
    if (dd) return dd;
    const ctrl = wrap.querySelector('.ts-control [aria-controls]');
    const id = ctrl && ctrl.getAttribute('aria-controls');
    if (id) {
      const c = document.getElementById(id);
      if (c) return c.closest('.ts-dropdown') || c;
    }
    return null;
  }

  async function widgetPick(el, value, text) {
    const wrap = widgetWrapOf(el);
    if (!wrap) return { ok: false, why: 'wrapper-widget-tidak-ditemukan' };
    const attr = String(value).replace(/[\\"]/g, '\\$&');
    /* Ruang pencarian opsi: wrapper + dropdown-nya bila dropdown hidup di
       luar wrapper (TomSelect dropdownParent). */
    const optScopes = () => {
      const dd = widgetDropdownOf(wrap);
      return dd && !wrap.contains(dd) ? [wrap, dd] : [wrap];
    };
    const findOpt = () =>
      optScopes()
        .map((sc) => sc.querySelector('[data-selectable][data-value="' + attr + '"]'))
        .find(Boolean) ||
      optScopes()
        .map((sc) => sc.querySelector('[data-value="' + attr + '"]'))
        .find(Boolean) ||
      null;
    const findOptByText = () => {
      if (!text) return null;
      const want = String(text).trim().toLowerCase();
      for (const sc of optScopes()) {
        const o = [...sc.querySelectorAll('[data-selectable], .choices__item--choice')].find(
          (x) => (x.textContent || '').trim().toLowerCase() === want
        );
        if (o) return o;
      }
      return null;
    };
    const pickedNow = () =>
      el.value === String(value) ||
      !!wrap.querySelector('.item[data-value="' + attr + '"]') ||
      !!wrap.querySelector('.choices__item--selected[data-value="' + attr + '"]');

    /* Dropdown bisa saja belum terender saat widgetPick mulai — resolve
       ulang tiap pengecekan, bukan sekali di awal. Dropdown yang belum ada
       berarti tertutup, jadi tetap dicoba dibuka. */
    const isOpen = () => {
      const dd = widgetDropdownOf(wrap);
      return !!dd && getComputedStyle(dd).display !== 'none';
    };
    let opt = findOpt() || findOptByText();
    if (!opt && !isOpen()) {
      const ctl = wrap.querySelector('.ts-control, .choices');
      if (ctl) mouseBurst(ctl); // buka dropdown seperti klik user
      for (const wait of [0, 80, 250]) {
        await sleep(wait); // render isi dropdown tidak sinkron — beri waktu
        opt = findOpt() || findOptByText();
        if (opt) break;
      }
    }
    if (!opt) return { ok: false, why: 'opsi-tidak-ditemukan-di-widget' };
    mouseBurst(opt);
    for (const wait of [0, 120]) {
      await sleep(wait);
      if (pickedNow()) return { ok: true };
    }
    if (isOpen()) {
      // gagal pilih — tutup lagi dropdown yang sempat terbuka
      const ci = wrap.querySelector('input');
      if (ci) {
        ci.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
        );
      }
    }
    return { ok: false, why: 'klik-opsi-tak-berdampak' };
  }

  /* ---------- selector ---------- */

  function isUnique(sel) {
    try {
      return document.querySelectorAll(sel).length === 1;
    } catch {
      return false;
    }
  }

  function cssPath(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
      let seg = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift('#' + CSS.escape(node.id));
        break;
      }
      const parent = node.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (same.length > 1) seg += ':nth-of-type(' + (same.indexOf(node) + 1) + ')';
      }
      parts.unshift(seg);
      node = parent;
    }
    return parts.join(' > ');
  }

  function bestSelector(el) {
    const candidates = [];
    if (el.id) candidates.push('#' + CSS.escape(el.id));
    const attrs = ['data-testid', 'data-test', 'data-qa', 'formcontrolname', 'name'];
    for (const attr of attrs) {
      const v = el.getAttribute(attr);
      if (v) candidates.push('[' + attr + '="' + v.replace(/"/g, '\\"') + '"]');
    }
    for (const c of candidates) {
      if (isUnique(c)) return { selector: c, fallbacks: [] };
    }
    // selector utama = CSS path; kandidat atribut disimpan sebagai fallback
    return { selector: cssPath(el), fallbacks: candidates.slice(0, 2) };
  }

  function labelFor(el) {
    const clean = (s) => (s || '').trim().replace(/\s+/g, ' ');
    if (el.labels && el.labels[0]) return clean(el.labels[0].textContent);
    if (el.id) {
      const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (l) return clean(l.textContent);
    }
    const wrap = el.closest('label');
    if (wrap) return clean(wrap.textContent);
    const aria = el.getAttribute('aria-label');
    if (aria) return clean(aria);
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const t = document.getElementById(labelledby);
      if (t) return clean(t.textContent);
    }
    return el.getAttribute('placeholder') || el.name || '';
  }

  /* ---------- baris dinamis (input name="x[]" di tabel add/remove) ---------- */

  function nameSelector(name) {
    return '[name="' + String(name).replace(/"/g, '\\"') + '"]';
  }

  /* Posisi baris saat capture: tabel asal, name, dan urutan barisnya. */
  function arrayRowInfo(el) {
    const name = el.getAttribute('name');
    if (!name || !name.endsWith('[]')) return null;
    const table = el.closest('table');
    if (!table) return null;
    const same = Array.from(table.querySelectorAll(nameSelector(name)));
    return { tableId: table.id || '', name, index: same.indexOf(el) };
  }

  function rowsInTable(table, name) {
    return Array.from(table.querySelectorAll(nameSelector(name)));
  }

  /* HTML satu baris input baru, meniru output fungsi addElement* di app
     target. Dibangun via DOM murni TANPA mengeksekusi script apa pun —
     aman terhadap CSP halaman (script-src tanpa 'unsafe-inline'). Input
     hasil sintesis tetap terbaca FormData halaman karena DOM dibagi
     antar world. Tombol hapus memakai addEventListener, bukan onclick
     inline, jadi tetap berfungsi di bawah CSP ketat. */
  function rowHtmlFor(name) {
    const base = name.replace(/\[\]$/, '');
    if (base === 'quote_number') {
      return (
        '<tr><td><div class="input-group">' +
        '<span class="input-group-text"><b>1</b></span>' +
        '<input value="" type="number" name="quote_number[]" class="form-control" placeholder="Isi quote number" required>' +
        '</div></td><td>' +
        '<button type="button" class="btn btn-primary btn-xs float-right" title="Hapus baris (QA autofill)"><i class="ti-trash"></i></button>' +
        '</td></tr>'
      );
    }
    if (base === 'file_lampiran_url') {
      return (
        '<tr><td>' +
        '<input type="text" name="file_lampiran_url[]" class="form-control" placeholder="Enter URL" required>' +
        '</td><td></td></tr>'
      );
    }
    // file_lampiran (upload) — tidak bisa diisi otomatis (batasan browser),
    // disediakan agar jumlah baris konsisten dengan capture
    return (
      '<tr><td><div class="custom-file">' +
      '<input type="file" name="file_lampiran[]" class="custom-file-input" required>' +
      '<label class="custom-file-label">Choose file...</label>' +
      '</div></td><td></td></tr>'
    );
  }

  /* Tambah satu baris: tombol "add" asli app dulu (perilaku paling setia;
     diverifikasi per nama input — tombol yang cuma membuka modal otomatis
     dilewati), lalu fallback sintesis baris via DOM murni yang aman CSP. */
  function addRow(table, name) {
    const base = name.replace(/\[\]$/, '');
    const group = table.closest('.form-group') || table.parentElement || document;
    const btns = Array.from(group.querySelectorAll('button[onclick]')).filter((b) => {
      const oc = b.getAttribute('onclick') || '';
      return /add/i.test(oc) && !/remove|delete/i.test(oc);
    });
    // kandidat yang onclick-nya menyebut nama field dicoba lebih dulu
    btns.sort((a, b) => {
      const score = (b) =>
        (b.getAttribute('onclick') || '').toLowerCase().includes(base.toLowerCase()) ? 0 : 1;
      return score(a) - score(b);
    });
    for (const b of btns) {
      const beforeEls = new Set(Array.from(table.querySelectorAll('input')));
      const beforeBtn = rowsInTable(table, name).length;
      try {
        b.click();
      } catch {
        /* lanjut kandidat berikutnya */
      }
      if (rowsInTable(table, name).length > beforeBtn) return true;
      // kandidat salah sasaran: buang baris samping yang ikut terbuat
      // (mis. input file required yang bisa menggagalkan submit form)
      Array.from(table.querySelectorAll('input')).forEach((inp) => {
        if (!beforeEls.has(inp)) {
          const tr = inp.closest('tr');
          if (tr) tr.remove();
          else inp.remove();
        }
      });
    }

    // sintesis baris via DOM — tanpa tag/inline script, aman terhadap CSP
    const tbody = table.tBodies[0] || table;
    const before = rowsInTable(table, name).length;
    try {
      tbody.insertAdjacentHTML('beforeend', rowHtmlFor(name));
    } catch {
      return false;
    }
    if (rowsInTable(table, name).length <= before) return false;
    const row = tbody.lastElementChild;
    const trash = row && row.querySelector('button');
    if (trash) {
      trash.addEventListener('click', () => row.remove());
    }
    return true;
  }

  /* ---------- highlight capture (permanen sampai dibersihkan) ----------
     Berbeda dari flash fill yang sementara, highlight capture menempel
     selama form capture terbuka agar user tahu field mana yang terdeteksi.
     Daftar elemen tunggal di agent ini jadi satu-satunya sumber kebenaran —
     capture dari popup maupun panel sama-sama lewat sini, dan capture baru
     selalu menggantikan highlight lama sehingga tidak menumpuk. */

  let hlEls = [];

  function ensureHlStyle() {
    if (document.getElementById('qa-capture-hl-style')) return;
    const st = document.createElement('style');
    st.id = 'qa-capture-hl-style';
    st.textContent = '.qa-capture-hl { outline: 2px solid #16a34a !important; outline-offset: 1px; }';
    (document.head || document.documentElement).appendChild(st);
  }

  function markCaptureHighlight(els) {
    ensureHlStyle();
    clearCaptureHighlight();
    for (const el of els) {
      el.classList.add('qa-capture-hl');
      hlEls.push(el);
    }
  }

  function clearCaptureHighlight() {
    for (const el of hlEls) el.classList.remove('qa-capture-hl');
    hlEls = [];
  }

  /* ---------- capture ---------- */

  /* Dialog modal aktif — :modal hanya cocok untuk dialog showModal() yang
     memang menutupi halaman; dialog show()/open biasa tidak perlu ditumpangi. */
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

  async function capture() {
    const fields = [];
    const hitEls = []; // elemen terdeteksi — untuk highlight visual

    // Capture fokus modal (setting, default ON): saat ada modal <dialog>
    // terbuka, hanya field di dalam modal yang dipindai — filter, pagination,
    // dan field lain di belakang modal diabaikan.
    let root = document;
    let scopedModal = false;
    try {
      if (await DB.getCaptureModalOnly()) {
        const modal = activeModalDialog();
        if (modal) {
          root = modal;
          scopedModal = true;
        }
      }
    } catch {
      root = document; // setting tak terbaca — pakai pemindaian seluruh halaman
    }
    root.querySelectorAll(FILLABLE).forEach((el) => {
      if (!isVisibleField(el) || !isCapturable(el)) return;
      const t = inputType(el);

      // Nilai cadangan dari DOM widget select enhanced (TomSelect dkk) —
      // dipakai bila field aslinya kosong/tersembunyi total.
      let wItems = null;
      if (t === 'checkbox' || t === 'radio') {
        if (!el.checked) return; // hanya state terisi yang dicatat
      } else if (t === 'select') {
        const sel = [...el.selectedOptions].map((o) => o.value);
        if (!sel.length || sel.every((v) => v === '')) {
          wItems = widgetItemsOf(el);
          if (!wItems.length) return;
        }
      } else if (!String(el.value || '').trim()) {
        wItems = widgetItemsOf(el);
        if (!wItems.length) return;
      }

      const { selector, fallbacks } = bestSelector(el);
      const field = {
        selector,
        fallbacks,
        label: labelFor(el),
        type: t,
        sensitive: t === 'password',
      };
      const ar = arrayRowInfo(el);
      if (ar) field.arrayRow = ar;
      if (t === 'checkbox') {
        field.value = true;
      } else if (t === 'radio') {
        field.value = true;
        field.radioValue = el.value;
      } else if (t === 'select') {
        if (wItems) {
          field.value = wItems.length === 1 ? wItems[0].value : wItems.map((i) => i.value);
          field.text = wItems.map((i) => i.text).join(', ');
        } else {
          field.value = el.multiple
            ? [...el.selectedOptions].map((o) => o.value)
            : el.value;
          // teks opsi terpilih — dipakai saat fill untuk membuat opsi (select2)
          field.text = ((el.selectedOptions[0] && el.selectedOptions[0].text) || '').trim();
        }
      } else {
        field.value = wItems
          ? wItems.map((i) => i.text).join(', ')
          : el.value;
      }
      fields.push(field);
      // Highlight di elemen yang TERLIHAT — field asli milik widget select
      // enhanced disembunyikan widget-nya (1px & clip), outline di sana
      // tidak akan tampak di layar.
      hitEls.push(widgetWrapOf(el) || el);
    });

    // Highlight permanen semua field terdeteksi — bertahan selama form
    // capture terbuka; dibersihkan lewat clearCaptureHighlight().
    markCaptureHighlight(hitEls);

    return {
      url: location.href,
      title: document.title,
      count: fields.length,
      fields,
      scopedModal,
    };
  }

  /* ---------- fill ---------- */

  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  }

  function fire(el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  function flash(el, ok, ms = 1200) {
    const prev = el.style.outline;
    el.style.outline = ok ? '2px solid #16a34a' : '2px solid #dc2626';
    setTimeout(() => {
      el.style.outline = prev;
    }, ms);
  }

  function resolveEl(field) {
    const sels = [field.selector].concat(field.fallbacks || []);
    for (const s of sels) {
      if (!s) continue;
      try {
        const el = document.querySelector(s);
        if (el) return el;
      } catch {
        /* selector rusak -> lanjut fallback */
      }
    }
    // Rescue terakhir: cocokkan label/aria/placeholder yang tersimpan
    if (field.label) {
      const want = String(field.label).toLowerCase();
      const hits = [...document.querySelectorAll(FILLABLE)].filter(
        (el) => isVisibleField(el) && labelFor(el).toLowerCase() === want
      );
      if (hits.length === 1) return hits[0];
    }
    return null;
  }

  /* Selesaikan input baris dinamis lewat tabel asalnya — bukan lewat
     selector generik yang berisiko salah sasaran ke tabel lain. */
  function resolveArrayRow(ar) {
    let table = (ar.tableId && document.getElementById(ar.tableId)) || null;
    if (!table) {
      const any = document.querySelector(nameSelector(ar.name));
      table = any ? any.closest('table') : null;
    }
    if (!table && ar.name.endsWith('[]')) {
      // konvensi id tabel di app target: table_<nama-field> (varian _url
      // menumpang tabel induknya, mis. table_file_lampiran)
      const base = ar.name.replace(/\[\]$/, '');
      table =
        document.getElementById('table_' + base) ||
        document.getElementById('table_' + base.replace(/_url$/, '')) ||
        null;
    }
    if (!table) {
      return { reason: 'Tabel "' + (ar.tableId || ar.name) + '" tidak ditemukan' };
    }

    let rows = rowsInTable(table, ar.name);
    let guard = 0;
    while (rows.length <= ar.index && guard < 10) {
      if (!addRow(table, ar.name)) break;
      rows = rowsInTable(table, ar.name);
      guard++;
    }
    if (rows.length <= ar.index) {
      return {
        reason:
          'Baris ke-' + (ar.index + 1) +
          ' belum ada & tidak bisa dibuat otomatis',
      };
    }
    return { el: rows[ar.index] };
  }

  /* Profile lama (sebelum v0.7) tidak menyimpan arrayRow. Rekonstruksi dari
     atribut name yang tersimpan di selector/fallback + urutan kemunculan
     (urutan capture = urutan DOM). */
  function backfillArrayRows(values) {
    const counters = {};
    for (const f of values) {
      if (f.arrayRow || !Array.isArray(f.fallbacks)) continue;
      let name = null;
      for (const s of [f.selector].concat(f.fallbacks)) {
        const m = /\[name="([^"]*\[\])"\]/.exec(String(s || ''));
        if (m) {
          name = m[1];
          break;
        }
      }
      if (!name) continue;
      counters[name] = (counters[name] ?? -1) + 1;
      f.arrayRow = { tableId: '', name, index: counters[name] };
    }
  }

  async function fillOne(field) {
    const fail = (reason, el, extra) => {
      if (el) flash(el, false);
      return {
        selector: field.selector,
        label: field.label || '',
        ok: false,
        reason,
        ...(extra || {}),
      };
    };

    /* Alasan jalur widget gagal (diisi di cabang select) — tercetak sebagai
       penanda stale di hasil bila fill jatuh ke jalur native. */
    let widgetWhy = '';

    /* Baris dinamis (name="x[]") punya jalur resolusi sendiri; selector
       generik sengaja tidak dipakai fallback karena ambigu. */
    let el = null;
    const ar = field.arrayRow;
    if (ar && ar.name) {
      const st = resolveArrayRow(ar);
      if (st.reason) return fail(st.reason);
      el = st.el;
    } else {
      el = resolveEl(field);
    }
    if (!el) return fail('Field tidak ditemukan');
    if (el.disabled) return fail('Field disabled', el);

    const t = inputType(el);
    if (t === 'file') {
      // file input tidak bisa diisi programatik (batasan keamanan browser)
      return fail('Upload file diisi manual', el, { skipped: true });
    }

    try {
      if (t === 'checkbox') {
        el.checked = !!field.value;
        fire(el, 'click');
        fire(el, 'change');
      } else if (t === 'radio') {
        el.checked = true;
        fire(el, 'click');
        fire(el, 'change');
      } else if (t === 'select') {
        const wanted = (Array.isArray(field.value) ? field.value : [field.value]).map(String);

        /* Jalur widget dulu: klik opsi di UI widget-nya agar state internal
           dan tampilannya ikut terisi. Bila widget tidak mau — catat titik
           gagalnya untuk diagnostik, lalu jatuh ke jalur native di bawah. */
        if (widgetWrapOf(el)) {
          const targets = el.multiple ? wanted : wanted.slice(0, 1);
          let picked = 0;
          for (let i = 0; i < targets.length; i++) {
            const r = await widgetPick(el, targets[i], i === 0 ? field.text : '');
            if (r.ok) picked++;
            else widgetWhy = r.why;
          }
          if (targets.length && picked === targets.length) {
            flash(el, true);
            return { selector: field.selector, label: field.label || '', ok: true };
          }
        }

        if (el.multiple) {
          [...el.options].forEach((o) => {
            o.selected = wanted.includes(o.value) || wanted.includes(o.text.trim());
          });
        } else {
          const opt =
            [...el.options].find((o) => o.value === wanted[0]) ||
            [...el.options].find((o) => o.text.trim() === wanted[0].trim());
          if (!opt && field.text) {
            // select2 AJAX: opsi tidak ada di DOM -> buat dari teks tersimpan
            // (pola preselect resmi select2); change menyinkronkan widget
            el.add(new Option(field.text, wanted[0], true, true));
          }
          const finalOpt = opt || [...el.options].find((o) => o.value === wanted[0]);
          if (!finalOpt) {
            const hint = field.text
              ? ''
              : ' (profile lama tanpa teks opsi — capture ulang)';
            return fail('Opsi "' + wanted[0] + '" tidak ditemukan' + hint, el);
          }
          el.value = finalOpt.value;
          if (!opt) {
            // select bertingkat (mis. unit_id diisi AJAX setelah divisi
            // berubah) bisa dikosongkan lagi SETELAH fill selesai —
            // pastikan pilihan terpasang ulang
            const text = field.text;
            setTimeout(() => {
              if (!el.isConnected || el.value === wanted[0]) return;
              let o2 = [...el.options].find((x) => x.value === wanted[0]);
              if (!o2 && text) el.add(new Option(text, wanted[0], true, true));
              if (el.querySelector('option[value="' + wanted[0].replace(/"/g, '\\"') + '"]')) {
                el.value = wanted[0];
                fire(el, 'change');
              }
            }, 1500);
          }
        }
        fire(el, 'change');
      } else {
        el.focus();
        setNativeValue(el, String(field.value == null ? '' : field.value));
        fire(el, 'input');
        fire(el, 'change');
        el.blur();
      }
      flash(el, true);
      // Jalur native berhasil tapi jalur widget gagal → nilai masuk di field
      // asli, namun tampilan widget kemungkinan tidak ikut — tandai agar
      // user tahu hasilnya belum 100% sinkron dengan widget.
      return {
        selector: field.selector,
        label: field.label || '',
        ok: true,
        ...(widgetWhy ? { stale: 'widget: ' + widgetWhy } : {}),
      };
    } catch (e) {
      return fail(String((e && e.message) || e), el);
    }
  }

  async function fill(values) {
    backfillArrayRows(values || []);
    // Sekuensial (bukan map paralel) — urutan field penting untuk select
    // bertingkat, dan jalur widget kini butuh await.
    const results = [];
    for (const v of values || []) results.push(await fillOne(v));
    return {
      ok: true,
      results,
      filled: results.filter((r) => r.ok).length,
      skipped: results.filter((r) => !r.ok && r.skipped).length,
      failed: results.filter((r) => !r.ok && !r.skipped).length,
    };
  }

  /* Diekspos untuk panel cepat (content/widget.js) yang berjalan di world yang sama */
  window.__qaFormAgent = { capture, fill, clearCaptureHighlight };

  /* ---------- message router ---------- */

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('QA_')) return;
    if (msg.type === 'QA_PING') {
      sendResponse({ ok: true });
    } else if (msg.type === 'QA_CAPTURE') {
      // capture kini async (membaca setting) — respons dikirim setelah selesai
      capture().then(
        (data) => sendResponse({ ok: true, data }),
        () => sendResponse({ ok: false })
      );
      return true;
    } else if (msg.type === 'QA_FILL') {
      // fill kini async (menunggu render dropdown widget)
      fill(msg.values).then(
        (r) => sendResponse(r),
        () => sendResponse({ ok: false })
      );
      return true;
    } else if (msg.type === 'QA_CLEAR_HL') {
      clearCaptureHighlight();
      sendResponse({ ok: true });
    }
  });
})();
