/* Wrapper chrome.storage.local sebagai "database" profile, grup & log.
   Dipakai oleh popup.js, options.js, dan widget.js (content world). */

const DB = {
  /* ---------- profile ---------- */

  async getProfiles() {
    const { profiles = [] } = await chrome.storage.local.get('profiles');
    return profiles;
  },

  async saveProfiles(list) {
    await chrome.storage.local.set({ profiles: list });
  },

  async addProfile(profile) {
    const list = await this.getProfiles();
    list.push(profile);
    await this.saveProfiles(list);
    return profile;
  },

  async upsertProfile(profile) {
    const list = await this.getProfiles();
    const i = list.findIndex((p) => p.id === profile.id);
    if (i >= 0) list[i] = profile;
    else list.push(profile);
    await this.saveProfiles(list);
    return profile;
  },

  async deleteProfile(id) {
    let list = await this.getProfiles();
    list = list.filter((p) => p.id !== id);
    await this.saveProfiles(list);
  },

  /* Nama unik gaya Windows: kalau sudah dipakai -> "Nama (2)", "Nama (3)", dst.
     Pembandingan tidak peka huruf besar/kecil. */
  async uniqueName(name, excludeId) {
    const list = await this.getProfiles();
    const taken = new Set(
      list
        .filter((p) => p.id !== excludeId)
        .map((p) => (p.name || '').trim().toLowerCase())
    );
    const base = String(name || '').trim() || 'Profile';
    if (!taken.has(base.toLowerCase())) return base;
    let i = 2;
    while (taken.has((base + ' (' + i + ')').toLowerCase())) i++;
    return base + ' (' + i + ')';
  },

  /* Kandidat update utk hasil capture: profile aktif dengan URL pattern
     yang cocok DAN punya minimal satu field sama (selector+label+tipe).
     Diurutkan dari overlap terbanyak. */
  async findUpdateCandidates(url, fields) {
    const list = (await this.getProfiles()).filter((p) => !p.archived);
    const keys = new Set(
      (fields || []).map((f) => f.selector + '|' + f.label + '|' + f.type)
    );
    const out = [];
    for (const p of list) {
      if (!url || !this.isMatch(p.urlPattern, url)) continue;
      const overlap = (p.fields || []).filter(
        (f) => keys.has(f.selector + '|' + f.label + '|' + f.type)
      ).length;
      if (overlap > 0) out.push({ profile: p, overlap });
    }
    out.sort((a, b) => b.overlap - a.overlap);
    return out;
  },

  /* Popup & panel cepat hanya menampilkan grup yang cocok dengan URL
     halaman aktif. Default ON (nilainya tidak pernah diset = true). */
  async getShowUrlMatchedOnly() {
    const { showUrlMatchedOnly } = await chrome.storage.local.get('showUrlMatchedOnly');
    return showUrlMatchedOnly !== false;
  },

  async setShowUrlMatchedOnly(v) {
    await chrome.storage.local.set({ showUrlMatchedOnly: !!v });
  },

  /* ---------- grup (CRUD) ---------- */

  async getGroups() {
    const { groups = [] } = await chrome.storage.local.get('groups');
    return groups;
  },

  async saveGroups(list) {
    const uniq = [...new Set(list.map((g) => String(g).trim()).filter(Boolean))];
    await chrome.storage.local.set({ groups: uniq });
  },

  async addGroup(name) {
    const n = String(name || '').trim();
    if (!n) throw new Error('Nama grup tidak boleh kosong.');
    if (n.toLowerCase() === 'umum') throw new Error('"Umum" adalah grup default — pakai nama lain.');
    const groups = await this.getGroups();
    if (groups.some((g) => g.toLowerCase() === n.toLowerCase())) {
      throw new Error('Grup "' + n + '" sudah ada.');
    }
    groups.push(n);
    await this.saveGroups(groups);
    return n;
  },

  /* Rename grup: profile anggotanya ikut berpindah. */
  async renameGroup(oldName, newName) {
    const n = String(newName || '').trim();
    if (!n) throw new Error('Nama grup tidak boleh kosong.');
    if (n.toLowerCase() === 'umum') throw new Error('"Umum" adalah grup default — pakai nama lain.');
    if (oldName.toLowerCase() === 'umum') throw new Error('Grup default "Umum" tidak bisa di-rename.');
    const groups = await this.getGroups();
    const i = groups.findIndex((g) => g === oldName);
    if (i < 0) throw new Error('Grup tidak ditemukan.');
    if (groups.some((g, j) => j !== i && g.toLowerCase() === n.toLowerCase())) {
      throw new Error('Grup "' + n + '" sudah ada.');
    }
    groups[i] = n;
    await this.saveGroups(groups);

    const profiles = await this.getProfiles();
    let changed = 0;
    for (const p of profiles) {
      if ((p.group || '').trim() === oldName) {
        p.group = n;
        changed++;
      }
    }
    await this.saveProfiles(profiles);
    // Migrasi posisi buka/tutup grup ke nama baru
    const ui = await this.getGroupUiState();
    if (Object.prototype.hasOwnProperty.call(ui, oldName)) {
      ui[n] = ui[oldName];
      delete ui[oldName];
      await this.setGroupUiState(ui);
    }
    return changed;
  },

  /* Hapus grup: profile anggotanya kembali ke "Umum" (group kosong). */
  async deleteGroup(name) {
    if (name.toLowerCase() === 'umum') throw new Error('Grup default "Umum" tidak bisa dihapus.');
    const groups = await this.getGroups();
    await this.saveGroups(groups.filter((g) => g !== name));

    const profiles = await this.getProfiles();
    let changed = 0;
    for (const p of profiles) {
      if ((p.group || '').trim() === name) {
        p.group = '';
        changed++;
      }
    }
    await this.saveProfiles(profiles);
    // Buang state UI grup yang dihapus
    const ui = await this.getGroupUiState();
    if (Object.prototype.hasOwnProperty.call(ui, name)) {
      delete ui[name];
      await this.setGroupUiState(ui);
    }
    return changed;
  },

  /* Semua nama grup yang dikenal: grup tersimpan + grup yang muncul di profile. */
  async allGroupNames() {
    const [groups, profiles] = await Promise.all([this.getGroups(), this.getProfiles()]);
    const set = new Set(groups.map((g) => g.trim()).filter(Boolean));
    for (const p of profiles) {
      const g = (p.group || '').trim();
      if (g) set.add(g);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'id'));
  },

  /* ---------- helper matching & grouping ---------- */

  patternToRegex(pattern) {
    const body = String(pattern)
      .trim()
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '\u0000')
      .replace(/\*/g, '[^/]*')
      .replace(/\u0000/g, '.*');
    return new RegExp('^' + body + '$', 'i');
  },

  isMatch(pattern, url) {
    if (!pattern || !url) return false;
    try {
      return this.patternToRegex(pattern).test(url);
    } catch {
      return false;
    }
  },

  /* Kelompokkan profile berdasarkan `group` (tanpa grup = "Umum").
     `knownGroups` = nama grup tersimpan (grup kosong tetap muncul).
     Grup yang berisi profile yang match dengan `url` diurut paling atas. */
  groupProfiles(list, url, knownGroups = []) {
    const map = new Map();
    for (const name of knownGroups) {
      const k = String(name).trim();
      if (k && k !== 'Umum') map.set(k, []);
    }
    for (const p of list) {
      const g = (p.group && String(p.group).trim()) || 'Umum';
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(p);
    }
    const groups = [...map.entries()].map(([name, items]) => ({ name, items }));

    const groupRank = (items) => {
      let best = 0;
      for (const p of items) {
        if (this.isMatch(p.urlPattern, url)) {
          best = Math.max(best, (p.urlPattern || '').length);
        }
      }
      return best;
    };
    groups.sort((a, b) => {
      const ra = groupRank(a.items);
      const rb = groupRank(b.items);
      if (ra !== rb) return rb - ra;
      return a.name.localeCompare(b.name, 'id');
    });

    for (const g of groups) {
      g.items.sort((x, y) => {
        const mx = this.isMatch(x.urlPattern, url);
        const my = this.isMatch(y.urlPattern, url);
        if (mx !== my) return my - mx;
        if (mx && my) return (y.urlPattern || '').length - (x.urlPattern || '').length;
        return (y.updatedAt || 0) - (x.updatedAt || 0);
      });
    }
    return groups;
  },

  /* ---------- pengaturan ---------- */

  async getWidgetEnabled() {
    const { widgetEnabled = true } = await chrome.storage.local.get('widgetEnabled');
    return widgetEnabled;
  },

  setWidgetEnabled(value) {
    return chrome.storage.local.set({ widgetEnabled: !!value });
  },

  /* Mode geser tombol QA: true = bebas ditarik, false = terkunci di lokasi default. */
  async getWidgetDragEnabled() {
    const { widgetDragEnabled = false } = await chrome.storage.local.get('widgetDragEnabled');
    return widgetDragEnabled;
  },

  setWidgetDragEnabled(value) {
    return chrome.storage.local.set({ widgetDragEnabled: !!value });
  },

  /* Posisi kustom tombol QA (koordinat layar kiri-atas tombol). */
  async getWidgetPos() {
    const { widgetPos } = await chrome.storage.local.get('widgetPos');
    return widgetPos && typeof widgetPos.left === 'number' ? widgetPos : null;
  },

  setWidgetPos(pos) {
    return chrome.storage.local.set({
      widgetPos: { left: Math.round(pos.left), top: Math.round(pos.top) },
    });
  },

  clearWidgetPos() {
    return chrome.storage.local.remove('widgetPos');
  },

  /* ---------- state UI grup (posisi buka/tutup section) ---------- */

  async getGroupUiState() {
    const { groupUiState = {} } = await chrome.storage.local.get('groupUiState');
    return groupUiState;
  },

  setGroupUiState(state) {
    return chrome.storage.local.set({ groupUiState: state });
  },

  /* ---------- auto backup ---------- */

  /* Handle folder backup (File System Access) disimpan di IndexedDB,
     karena chrome.storage tidak bisa menyimpan FileSystemHandle. */
  idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('qa-autofill-fs', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('handles');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async idbGetHandle() {
    const db = await this.idbOpen();
    return new Promise((resolve, reject) => {
      const req = db.transaction('handles', 'readonly').objectStore('handles').get('backupDir');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async idbSetHandle(handle) {
    const db = await this.idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, 'backupDir');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getAutoBackupState() {
    const s = await chrome.storage.local.get([
      'autoBackupEnabled',
      'lastBackupAt',
      'backupNeedsPermission',
      'lastBackupError',
    ]);
    return {
      enabled: !!s.autoBackupEnabled,
      lastBackupAt: s.lastBackupAt || 0,
      needsPermission: !!s.backupNeedsPermission,
      error: s.lastBackupError || '',
    };
  },

  setAutoBackupEnabled(value) {
    return chrome.storage.local.set({ autoBackupEnabled: !!value });
  },

  async getDarkMode() {
    const { darkMode = false } = await chrome.storage.local.get('darkMode');
    return darkMode;
  },

  setDarkMode(value) {
    return chrome.storage.local.set({ darkMode: !!value });
  },

  async getGuideCollapsed() {
    const { guideCollapsed = false } = await chrome.storage.local.get('guideCollapsed');
    return guideCollapsed;
  },

  setGuideCollapsed(value) {
    return chrome.storage.local.set({ guideCollapsed: !!value });
  },

  /* ---------- log ---------- */

  async getLogs() {
    const { logs = [] } = await chrome.storage.local.get('logs');
    return logs;
  },

  async addLog(entry) {
    const logs = await this.getLogs();
    logs.unshift(entry);
    await chrome.storage.local.set({ logs: logs.slice(0, 200) });
  },

  async clearLogs() {
    await chrome.storage.local.set({ logs: [] });
  },

  async clearAll() {
    await chrome.storage.local.remove(['profiles', 'logs', 'groups']);
  },

  uid() {
    return crypto.randomUUID();
  },
};
