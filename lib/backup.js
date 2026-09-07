/* Auto backup: tulis snapshot JSON ke folder pilihan user (File System Access).
   Dipakai oleh service worker (memicu otomatis) dan halaman Kelola (manual).
   Format file identik dengan hasil Export JSON, jadi bisa langsung di-Import. */

/* global DB */

const AutoBackup = {
  ALARM: 'qa-autobackup',
  KEEP: 10, // jumlah file backup yang dipertahankan

  stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return (
      d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      '-' + p(d.getHours()) + p(d.getMinutes())
    );
  },

  /* Di halaman (dengan gesture) requestPermission bisa memunculkan prompt.
     Di service worker tanpa gesture, requestPermission gagal -> dilempar ke pemanggil. */
  async ensurePermission(handle) {
    let perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return true;
    perm = await handle.requestPermission({ mode: 'readwrite' });
    return perm === 'granted';
  },

  /* force = true untuk backup manual walau auto backup sedang nonaktif. */
  async run(force = false) {
    const state = await DB.getAutoBackupState();
    if (!state.enabled && !force) {
      return { ok: false, reason: 'Auto backup nonaktif.' };
    }

    const handle = await DB.idbGetHandle();
    if (!handle) throw new Error('Folder backup belum dipilih.');
    if (!(await this.ensurePermission(handle))) {
      await chrome.storage.local.set({ backupNeedsPermission: true });
      throw new Error('Izin folder backup perlu diberikan ulang.');
    }

    const [profiles, groups] = await Promise.all([DB.getProfiles(), DB.getGroups()]);
    const payload = {
      kind: 'qa-form-autofill-export',
      version: 2,
      exportedAt: new Date().toISOString(),
      auto: true,
      groups,
      profiles,
    };

    const name = 'formpilot-backup-' + this.stamp() + '.json';
    const fh = await handle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(new Blob([JSON.stringify(payload, null, 2)]));
    await w.close();

    await this.prune(handle);
    await chrome.storage.local.set({
      lastBackupAt: Date.now(),
      backupNeedsPermission: false,
      lastBackupError: '',
    });
    return { ok: true, name };
  },

  /* Simpan hanya KEEP file terbaru (nama memuat timestamp -> urut kronologis). */
  async prune(handle, keep = this.KEEP) {
    const names = [];
    for await (const [name, h] of handle.entries()) {
      // pola lama (qa-autofill-backup-) tetap dikenal supaya file sebelum
      // rename ikut ter-prune, bukan menumpuk selamanya
      if (h.kind === 'file' && /^(?:qa-autofill-backup|formpilot-backup)-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(name)) {
        names.push(name);
      }
    }
    names.sort();
    for (const name of names.slice(0, Math.max(0, names.length - keep))) {
      try {
        await handle.removeEntry(name);
      } catch {
        /* file mungkin sedang dipakai — abaikan */
      }
    }
  },
};
