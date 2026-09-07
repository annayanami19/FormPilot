/* Resolver placeholder dinamis. Dipanggil saat FILL, bukan saat capture,
   supaya nilai selalu segar setiap eksekusi.
   Didukung: {{today}} {{today+7}} {{today-3}} {{time}} {{timestamp}} {{uuid}} */

function resolvePlaceholders(text) {
  if (typeof text !== 'string') return text;
  const now = new Date();
  const fmtDate = (d) =>
    d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');

  return text.replace(/\{\{\s*([a-zA-Z]+)(?:\s*([+-]\d+))?\s*\}\}/g, (raw, name, offset) => {
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
        return raw; // placeholder tak dikenal: dibiarkan apa adanya
    }
  });
}
