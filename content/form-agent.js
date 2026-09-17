/* FormPilot — Content Agent
   Di-inject on-demand ke tab aktif (chrome.scripting.executeScript).
   Self-contained & idempotent. Komunikasi via chrome.runtime.onMessage:
   - QA_PING     -> cek keberadaan agent
   - QA_CAPTURE  -> scan field yang terisi -> kembalikan daftar field
   - QA_GENERATE -> scan struktur form -> kembalikan field berisi token
                    data dummy ({{nama}}, {{acak}}, dst dari lib/generator.js)
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

  /* ---------- baris dinamis (input name="x[]" di grup add/remove) ---------- */

  function nameSelector(name) {
    return '[name="' + String(name).replace(/"/g, '\\"') + '"]';
  }

  /* Posisi baris saat capture: grup baris asal (tabel ATAU div add/remove),
     name, dan urutan barisnya. Kontainer div dicatat lewat id-nya bila ada;
     tanpa id pun fill tetap bisa menemukannya ulang lewat rowGroupOf(). */
  function arrayRowInfo(el) {
    const name = el.getAttribute('name');
    if (!name || !name.endsWith('[]')) return null;
    const group = el.closest('table') || rowGroupOf(el, name);
    const same = group
      ? Array.from(group.querySelectorAll(nameSelector(name)))
      : Array.from(document.querySelectorAll(nameSelector(name)));
    return { tableId: (group && group.id) || '', name, index: same.indexOf(el) };
  }

  function rowsInTable(table, name) {
    return Array.from(table.querySelectorAll(nameSelector(name)));
  }

  /* Kontainer grup baris untuk pola add/remove BERBAS DIV (mis. deret
     .input-group di dalam satu div bertombol +/−) — leluhur terendah yang
     memuat semua input se-nama. Kurang dari dua baris atau menyebar sampai
     <body> berarti tidak ada kontainer yang berarti (index global cukup). */
  function rowGroupOf(el, name) {
    const same = Array.from(document.querySelectorAll(nameSelector(name)));
    if (same.length < 2) return null;
    let cand = el.parentElement;
    while (cand && cand !== document.documentElement) {
      if (same.every((i) => cand.contains(i))) {
        return cand === document.body ? null : cand; // pertama dari bawah = terendah
      }
      cand = cand.parentElement;
    }
    return null;
  }

  /* Pembungkus satu baris di dalam kontainer — <tr> untuk pola tabel,
     keturunan tepat di bawah kontainer untuk pola div. Null bila input
     ternyata di luar kontainer (mis. side-effect tombol yang salah sasaran). */
  function rowWrapperOf(container, inp) {
    const tr = inp.closest('tr');
    if (tr && container.contains(tr)) return tr;
    let n = inp;
    while (n.parentElement && n.parentElement !== container) n = n.parentElement;
    return n.parentElement === container ? n : null;
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
    if (base === 'file_lampiran') {
      return (
        '<tr><td><div class="custom-file">' +
        '<input type="file" name="file_lampiran[]" class="custom-file-input" required>' +
        '<label class="custom-file-label">Choose file...</label>' +
        '</div></td><td></td></tr>'
      );
    }
    // Nama tak dikenal → tanpa template; addRow meniru baris terakhir yang
    // sudah ada (pola baris div/tr apa pun), generik lintas situs.
    return null;
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
          const wrap = rowWrapperOf(table, inp);
          if (wrap) wrap.remove();
          else inp.remove();
        }
      });
    }

    // sintesis baris via DOM — tanpa tag/script yang dieksekusi, aman CSP.
    // Template khusus dulu; sisanya tiru baris terakhir yang ada (pola
    // generik baris div/tr apa pun): cloneNode menyalin atribut onclick
    // inline milik halaman, tapi bukan listener addEventListener — jadi
    // tombol hapus barisan tiruan ditempel ulang di bawah.
    const parent = table.tBodies[0] || table;
    const before = rowsInTable(table, name).length;
    const tpl = rowHtmlFor(name);
    let row = null;
    if (tpl) {
      try {
        parent.insertAdjacentHTML('beforeend', tpl);
      } catch {
        return false;
      }
      row = parent.lastElementChild;
    } else {
      const rows = rowsInTable(table, name);
      if (!rows.length) return false; // tak ada contoh baris untuk ditiru
      const wrap = rowWrapperOf(table, rows[rows.length - 1]) || rows[rows.length - 1];
      row = wrap.cloneNode(true);
      // tombol add inline milik halaman tidak ikut ditiru (bisa menggandakan
      // baris saat diklik); value dibersihkan agar tidak dobel terkirim
      row.querySelectorAll('button[onclick]').forEach((b) => {
        const oc = (b.getAttribute('onclick') || '').toLowerCase();
        if (/add/i.test(oc) && !/remove|delete/i.test(oc)) b.remove();
      });
      row.querySelectorAll('input, textarea, select').forEach((i) => {
        if (i.type === 'checkbox' || i.type === 'radio') i.checked = false;
        else if (i.tagName === 'SELECT') i.selectedIndex = 0;
        else i.value = '';
      });
      parent.appendChild(row);
    }
    if (rowsInTable(table, name).length <= before) return false;
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

  /* ---------- pengecualian field non-isian (mode generate) ---------- */

  /* Bila setting tak terbaca (DB belum termuat), pakai bawaan yang sama
     dengan GEN_EXCLUDE_DEFAULTS di lib/db.js. */
  const GEN_EXCLUDE_FALLBACK =
    'search, cari, pencarian, keyword, kata kunci, filter, page, halaman, pagination, per page, q';

  /* Field "bukan isian form": input[type=search], atau label/name/id/
     placeholder-nya memuat salah satu kata kunci pengecualian. Pencocokan
     kata utuh setelah _,-,. dinormalkan jadi spasi (supaya "search_product"
     tetap kena "search"); kata kunci pendek (≤2 huruf, mis. "q") hanya
     dicocokkan PERSIS ke name/id agar tidak salah sasaran. */
  function isNonFormInput(el, keywords) {
    if (inputType(el) === 'search') return true;
    if (!keywords || !keywords.length) return false;
    const hay = (
      (labelFor(el) || '') + ' ' + (el.name || '') + ' ' + (el.id || '') + ' ' +
      (el.getAttribute('placeholder') || '')
    )
      .toLowerCase()
      .replace(/[_\-.]+/g, ' ');
    for (const kw of keywords) {
      const k = String(kw).trim().toLowerCase();
      if (!k) continue;
      if (k.length <= 2) {
        if (el.name === k || el.id === k) return true;
        continue;
      }
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp('\\b' + escaped + '\\b').test(hay)) return true;
    }
    return false;
  }

  /* ---------- mode pilih elemen (🎯 pengecualian Generate) ---------- */

  let pickState = null;

  function ensurePickStyle() {
    if (document.getElementById('qa-pick-hl-style')) return;
    const st = document.createElement('style');
    st.id = 'qa-pick-hl-style';
    /* Kursor custom crosshair (SVG inline, hitam+putih agar kontras di
       latar terang MAUPUN gelap; hotspot 16,16 = titik tengah bidik).
       Crosshair bawaan sistem tipis & warnanya tergantung tema — sering
       nyaris tak terlihat. Dipasang di SELURUH halaman selama mode pilih:
       bila hanya di elemen yang di-hover, kursor bolak-balik antar gaya
       tiap pindah ke celah antar elemen (terlihat berkedip). */
    const cur =
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'>" +
      "<g stroke='black' stroke-width='3' stroke-linecap='round' fill='none'>" +
      "<line x1='16' y1='2' x2='16' y2='10'/><line x1='16' y1='22' x2='16' y2='30'/>" +
      "<line x1='2' y1='16' x2='10' y2='16'/><line x1='22' y1='16' x2='30' y2='16'/>" +
      "<circle cx='16' cy='16' r='7'/>" +
      '</g>' +
      "<g stroke='white' stroke-width='1.2' stroke-linecap='round' fill='none'>" +
      "<line x1='16' y1='2' x2='16' y2='10'/><line x1='16' y1='22' x2='16' y2='30'/>" +
      "<line x1='2' y1='16' x2='10' y2='16'/><line x1='22' y1='16' x2='30' y2='16'/>" +
      "<circle cx='16' cy='16' r='7'/>" +
      '</g></svg>")' +
      ' 16 16, crosshair';
    st.textContent =
      '.qa-pick-hl { outline: 2px dashed #dc2626 !important; outline-offset: 1px; }' +
      'html.qa-picking, html.qa-picking * { cursor: ' + cur + ' !important; }';
    (document.head || document.documentElement).appendChild(st);
  }

  function ensurePickBanner() {
    if (document.getElementById('qa-pick-banner')) return;
    const b = document.createElement('div');
    b.id = 'qa-pick-banner';
    // pointer-events:none — banner tidak bisa diklik & tak ikut ter-highlight
    b.style.cssText =
      'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
      'pointer-events:none;background:#111827;color:#fff;padding:8px 14px;border-radius:8px;' +
      'font:13px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3);';
    b.textContent = '🎯 Klik elemen yang mau dikecualikan dari Generate — Esc untuk batal';
    (document.body || document.documentElement).appendChild(b);
  }

  function cancelPick() {
    if (!pickState) return;
    document.removeEventListener('mouseover', pickState.onMove, true);
    document.removeEventListener('click', pickState.onClick, true);
    document.removeEventListener('keydown', pickState.onKey, true);
    document.documentElement.classList.remove('qa-picking');
    document.querySelectorAll('.qa-pick-hl').forEach((el) => el.classList.remove('qa-pick-hl'));
    const b = document.getElementById('qa-pick-banner');
    if (b) b.remove();
    pickState = null;
  }

  /* Masuk mode pilih: hover = highlight, klik = pilih elemen, Esc = batal.
     onPicked(rule|null) dipanggil TEPAT sekali — rule berisi selector gaya
     capture (bestSelector) + urlPattern origin halaman. */
  function startPick(onPicked) {
    if (typeof onPicked !== 'function') return false;
    cancelPick(); // mode pilih sebelumnya masih jalan? hentikan dulu
    ensurePickStyle();
    ensurePickBanner();
    document.documentElement.classList.add('qa-picking');

    const finish = (el) => {
      cancelPick();
      let rule = null;
      if (el instanceof Element) {
        const { selector, fallbacks } = bestSelector(el);
        let pattern = '';
        try {
          pattern = new URL(location.href).origin + '/**';
        } catch {
          pattern = '';
        }
        rule = {
          name: labelFor(el) || el.name || inputType(el) || 'Elemen',
          selector,
          fallbacks,
          label: labelFor(el),
          type: inputType(el),
          urlPattern: pattern,
        };
      }
      try {
        onPicked(rule);
      } catch {
        /* callback panel mati — abaikan */
      }
    };

    const onMove = (e) => {
      if (!(e.target instanceof Element)) return;
      if (pickState.hovered && pickState.hovered !== e.target) {
        pickState.hovered.classList.remove('qa-pick-hl');
      }
      pickState.hovered = e.target;
      pickState.hovered.classList.add('qa-pick-hl');
    };
    const onClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      finish(e.target instanceof Element ? e.target : null);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      finish(null);
    };

    pickState = { onMove, onClick, onKey, hovered: null };
    document.addEventListener('mouseover', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    return true;
  }

  /* Apakah field kena aturan pengecualian elemen: elemennya sendiri cocok
     selector ATAU berada di dalam elemen yang dipilih (bisa memilih kotak
     pembungkus search bar — semua field di dalamnya ikut terkecualikan). */
  function matchesExclusion(el, rules) {
    for (const x of rules || []) {
      for (const s of [x.selector].concat(x.fallbacks || [])) {
        if (!s) continue;
        try {
          if (el.matches(s) || el.closest(s)) return true;
        } catch {
          /* selector rusak — lewati */
        }
      }
    }
    return false;
  }

  async function capture(opts) {
    const gen = !!(opts && opts.generate);
    const fields = [];
    const hitEls = []; // elemen terdeteksi — untuk highlight visual
    // Mode generate: cukup SATU field perwakilan per grup radio dan per
    // name="x[]" — token di dalamnya ({{acak}}, {{nama}}, dll) menyebar
    // sendiri ke anggota grup lainnya saat fill.
    const seenRadio = new Set();
    const seenArray = new Set();

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

    // Mode generate: baca pengaturan pengecualian field non-isian
    // (search/filter/pagination) + daftar pengecualian elemen hasil 🎯.
    // Gagal baca → pakai bawaan.
    let skipNonForm = true;
    let excludeKws = GEN_EXCLUDE_FALLBACK.split(',');
    let exclusionRules = [];
    if (gen) {
      try {
        skipNonForm = await DB.getGenSkipNonForm();
        excludeKws = (await DB.getGenExcludeKeywords()).split(',');
        const allRules = await DB.getGenExclusions();
        // Aturan hanya berlaku di situs dengan urlPattern yang cocok
        exclusionRules = allRules.filter(
          (x) => !x.urlPattern || DB.isMatch(x.urlPattern, location.href)
        );
      } catch {
        /* pakai bawaan di atas */
      }
    }

    root.querySelectorAll(FILLABLE).forEach((el) => {
      if (!isVisibleField(el) || !isCapturable(el)) return;
      const t = inputType(el);

      // Nilai cadangan dari DOM widget select enhanced (TomSelect dkk) —
      // dipakai bila field aslinya kosong/tersembunyi total. Dideklarasikan
      // di level callback karena dirujuk lagi saat penugasan nilai di
      // bawah; mode generate tidak membaca nilai sama sekali.
      let wItems = null;

      if (gen) {
        // Generate menyertakan field yang KOSONG sekalipun — justru itu
        // sasarannya. Field non-isian (search/filter/pagination) dan field
        // yang kena aturan pengecualian elemen dilewati.
        if (skipNonForm && isNonFormInput(el, excludeKws)) return;
        if (matchesExclusion(el, exclusionRules)) return;
        // Radio & baris dinamis di-dedupe per grup.
        if (t === 'radio') {
          const key = el.name || 'sel:' + bestSelector(el).selector;
          if (seenRadio.has(key)) return;
          seenRadio.add(key);
        }
        const nm = el.getAttribute('name');
        if (nm && nm.endsWith('[]')) {
          if (seenArray.has(nm)) return;
          seenArray.add(nm);
        }
      } else if (t === 'checkbox' || t === 'radio') {
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
      if (gen) {
        // Nilai = token data dummy; di-resolve jadi nilai nyata saat FILL.
        // Password tetap sensitive (tersegel bila vault aktif).
        const token = window.Gen
          ? window.Gen.inferToken({
              label: field.label,
              type: t,
              name: el.getAttribute('name') || '',
              id: el.id || '',
            })
          : '{{acak}}';
        if (t === 'radio') {
          field.value = true;
          field.radioValue = token;
        } else {
          field.value = token;
        }
      } else if (t === 'checkbox') {
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

  /* Selesaikan input baris dinamis lewat grup baris asalnya (tabel ATAU
     div add/remove) — bukan lewat selector generik yang berisiko salah
     sasaran ke grup lain. */
  function resolveArrayRow(ar) {
    let table = (ar.tableId && document.getElementById(ar.tableId)) || null;
    if (!table) {
      const any = document.querySelector(nameSelector(ar.name));
      table = any ? any.closest('table') || rowGroupOf(any, ar.name) : null;
    }
    if (!table && ar.name.endsWith('[]')) {
      // konvensi id grup di app target: table_<nama-field> (varian _url
      // menumpang grup induknya, mis. table_file_lampiran)
      const base = ar.name.replace(/\[\]$/, '');
      table =
        document.getElementById('table_' + base) ||
        document.getElementById('table_' + base.replace(/_url$/, '')) ||
        null;
    }
    if (!table) {
      // Tanpa kontainer jelas (baris menyebar / profil lama di DOM berbeda)
      // — masih bisa diisi bila jumlah baris yang ada cukup; membuat
      // baris baru tanpa kontainer tidak bisa dilakukan dengan aman.
      const all = Array.from(document.querySelectorAll(nameSelector(ar.name)));
      if (all.length > ar.index) return { el: all[ar.index] };
      return {
        reason:
          'Baris ke-' + (ar.index + 1) +
          ' tidak bisa dibuat — grup baris "' + (ar.tableId || ar.name) +
          '" tidak ditemukan',
      };
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

  /* ---------- token {{acak}} (di-resolve agent-side) ---------- */

  /* {{acak}} butuh konteks halaman (opsi select/radio yang benar-benar
     ada), jadi sengaja tidak di-resolve oleh placeholder di popup/panel —
     melainkan di sini, tepat sebelum field diisi. */
  const ACAK_RE = /\{\{\s*acak\s*\}\}/;

  function hasAcak(v) {
    return Array.isArray(v)
      ? v.some((x) => typeof x === 'string' && ACAK_RE.test(x))
      : typeof v === 'string' && ACAK_RE.test(v);
  }

  /* Opsi layak dipilih acak: bukan disabled, bukan value kosong, dan bukan
     placeholder umum ("— Pilih —", "Pilih...", "-- Select --"). */
  function randomOptionOf(el) {
    const garis = /^(?:--|–|—|=|·|\*|\.|\s)+$/;
    const pilih = /^(?:silah?kan\s+)?(?:pilih|pilihlah|select|plih)\b/i;
    let pool = [...el.options].filter(
      (o) =>
        !o.disabled &&
        o.value !== '' &&
        !garis.test(o.text.trim()) &&
        !pilih.test(o.text.trim())
    );
    if (!pool.length) {
      pool = [...el.options].filter((o) => !o.disabled && o.value !== '');
    }
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
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
        // {{acak}} → centang / hilangkan centang secara acak
        el.checked =
          typeof field.value === 'string' && ACAK_RE.test(field.value)
            ? Math.random() < 0.5
            : !!field.value;
        fire(el, 'click');
        fire(el, 'change');
      } else if (t === 'radio') {
        // {{acak}} → pilih satu radio acak dari grup yang sama (bukan
        // selalu radio yang tersimpan di profile)
        if (
          typeof field.radioValue === 'string' &&
          ACAK_RE.test(field.radioValue) &&
          el.name
        ) {
          const group = [...document.querySelectorAll('input[type="radio"]')].filter(
            (r) => r.name === el.name && !r.disabled && isVisibleField(r)
          );
          if (group.length > 1) el = group[Math.floor(Math.random() * group.length)];
        }
        el.checked = true;
        fire(el, 'click');
        fire(el, 'change');
      } else if (t === 'select') {
        // {{acak}} → pilih opsi acak dari opsi asli halaman; select
        // multiple dapat 1–3 opsi sekaligus
        if (hasAcak(field.value)) {
          if (el.multiple) {
            const chosen = [];
            const taken = new Set();
            const wantN = 1 + Math.floor(Math.random() * 3);
            let guard = 20;
            while (chosen.length < wantN && guard-- > 0) {
              const o = randomOptionOf(el);
              if (o && !taken.has(o.value)) {
                taken.add(o.value);
                chosen.push({ value: o.value, text: o.text.trim() });
              }
            }
            if (!chosen.length) return fail('Tidak ada opsi untuk {{acak}}', el);
            field.value = chosen.map((c) => c.value);
            field.text = chosen.map((c) => c.text).join(', ');
          } else {
            const o = randomOptionOf(el);
            if (!o) return fail('Tidak ada opsi untuk {{acak}}', el);
            field.value = o.value;
            field.text = o.text.trim();
          }
        }
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
        let txt = String(field.value == null ? '' : field.value);
        // Sisa {{acak}} pada input teks/textarea → kata acak pendek
        if (ACAK_RE.test(txt)) {
          txt = txt.replace(/\{\{\s*acak\s*\}\}/g, () =>
            window.Gen ? window.Gen.word() : 'qa'
          );
        }
        // <input type="date"> hanya menerima YYYY-MM-DD — nilai lain
        // DITOLAK diam-diam oleh browser (field tetap kosong). Normalisasi:
        // konversi DD/MM/YYYY (urutan dibalik bila bulan > 12), dan bila
        // tetap tidak valid (mis. token belum ter-resolve) → tanggal acak.
        if (t === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(txt)) {
          const p2 = (s) => String(s).padStart(2, '0');
          const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(txt.trim());
          if (m) {
            let dd = m[1];
            let mm = m[2];
            if (+mm > 12 && +dd <= 12) [dd, mm] = [mm, dd];
            txt = m[3] + '-' + p2(mm) + '-' + p2(dd);
          }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(txt)) {
            txt = window.Gen ? window.Gen.tanggal() : txt;
          }
        }
        el.focus();
        setNativeValue(el, txt);
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
  window.__qaFormAgent = {
    capture,
    fill,
    clearCaptureHighlight,
    startPick,
    cancelPick,
  };

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
    } else if (msg.type === 'QA_GENERATE') {
      // generate profile: struktur form dipindai, value = token data dummy
      capture({ generate: true }).then(
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
