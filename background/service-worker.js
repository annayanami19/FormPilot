/* Service worker mini FormPilot.
   Tidak memegang state — hanya memicu auto backup:
   - storage.onChanged (profiles/groups) -> buat alarm 1 menit (debounce;
     alarm dengan nama sama selalu di-replace, jadi hitungan ikut ter-reset).
   - alarm menyala -> tulis file backup jika fitur enabled & izin folder masih sah. */

/* global DB, AutoBackup */
importScripts('../lib/db.js', '../lib/backup.js');

/* Panel cepat (content script) minta buka halaman Kelola —
   openOptionsPage hanya bisa dipanggil dari konteks extension. */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'QA_OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage().catch(() => {});
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (!changes.profiles && !changes.groups) return; // hanya perubahan data
  chrome.storage.local.get('autoBackupEnabled', ({ autoBackupEnabled }) => {
    if (!autoBackupEnabled) return; // disabled -> tidak ada apa-apa yang dijadwalkan
    chrome.alarms.create(AutoBackup.ALARM, { delayInMinutes: 1 });
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== AutoBackup.ALARM) return;
  AutoBackup.run().catch((e) => {
    const msg = String((e && e.message) || e);
    // Masalah izin sudah ditandai oleh AutoBackup.run(); sisanya dicatat untuk Kelola
    if (!/izin/i.test(msg)) {
      chrome.storage.local.set({ lastBackupError: msg });
    }
  });
});
