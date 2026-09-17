/* Resolver placeholder dinamis. Dipanggil saat FILL, bukan saat capture,
   supaya nilai selalu segar setiap eksekusi.
   Didukung: {{today}} {{today+7}} {{today-3}} {{time}} {{timestamp}} {{uuid}}
   plus semua token data dummy dari lib/generator.js ({{nama}}, {{email}},
   {{acak}}, {{angka:1-999}}, dst) — token tak dikenal didelegasikan ke
   Gen bila tersedia, kalau tidak dibiarkan apa adanya.
   Param persona (opsional): objek nilai konsisten untuk SATU eksekusi fill
   (dibangun Gen.buildPersona()) — token sama → nilai sama dalam satu fill.
   {{acak}} sengaja tidak di-resolve di sini karena pilihannya bergantung
   pada opsi yang benar-benar ada di halaman; form-agent yang menyelesaikannya. */

function resolvePlaceholders(text, persona) {
  if (typeof text !== 'string') return text;
  const now = new Date();
  const fmtDate = (d) =>
    d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');

  /* Nama token menerima huruf, angka & underscore ({{tgl_lahir}}, {{angka:1-999}}). */
  return text.replace(
    /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)(?:\s*([+-]\d+)|\s*:\s*([^}]+?))?\s*\}\}/g,
    (raw, name, offset, arg) => {
      switch (name) {
        case 'today': {
          const d = new Date(now);
          if (offset) d.setDate(d.getDate() + parseInt(offset, 10));
          return fmtDate(d);
        }
        case 'time':
          return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        case 'timestamp':
          return Date.now().toString();
        case 'uuid':
          return crypto.randomUUID();
        default:
          if (typeof window !== 'undefined' && window.Gen) {
            return window.Gen.generate(name, persona, raw, arg);
          }
          return raw; // placeholder tak dikenal: dibiarkan apa adanya
      }
    }
  );
}
