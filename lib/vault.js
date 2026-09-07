/* FormPilot — enkripsi nilai field sensitif (AES-GCM 256 + PBKDF2).
   Format nilai terenkripsi: "enc1:<salt b64>:<iv b64>:<ciphertext b64>".
   Salt acak ikut disimpan DI DALAM tiap nilai (self-contained), sehingga
   hasil export/backup tetap bisa didekripsi di mesin lain dengan passphrase
   yang sama — tidak ada state rahasia di storage selain blob verifikasi.
   Passphrase diingat per halaman/tab via unlock() (memori sesi saja,
   tidak pernah ditulis ke storage). */

/* global chrome */

const Vault = (() => {
  const PREFIX = 'enc1:';
  const CHECK_TEXT = 'qa-form-autofill-vault';
  // PBKDF2-SHA256 310rb iterasi — cukup lambat untuk brute force, tetap
  // ringan karena derivasi per-salt di-cache selama sesi.
  const ITERATIONS = 310000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

  let pass = null; // passphrase sesi (memori halaman ini saja)
  let keys = new Map(); // cache salt(b64) -> CryptoKey

  function subtleOk() {
    return typeof crypto !== 'undefined' && !!crypto.subtle;
  }

  async function deriveKey(p, saltB64) {
    if (keys.has(saltB64)) return keys.get(saltB64);
    const base = await crypto.subtle.importKey('raw', enc.encode(p), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: unb64(saltB64), iterations: ITERATIONS, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    keys.set(saltB64, key);
    return key;
  }

  async function seal(plaintext, p) {
    const saltB64 = b64(randomBytes(16));
    const iv = randomBytes(12);
    const key = await deriveKey(p, saltB64);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
    return PREFIX + saltB64 + ':' + b64(iv) + ':' + b64(ct);
  }

  /* Buka blob "enc1:...". Wajib unlock() dulu; gagal verifikasi GCM = throw. */
  async function open(blob) {
    if (!pass) throw new Error('Passphrase sesi belum dibuka.');
    const parts = String(blob).slice(PREFIX.length).split(':');
    if (parts.length !== 3) throw new Error('Format nilai terenkripsi tidak dikenal.');
    const key = await deriveKey(pass, parts[0]);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(parts[1]) }, key, unb64(parts[2]));
    return dec.decode(pt);
  }

  async function isActive() {
    try {
      const { vault } = await chrome.storage.local.get('vault');
      return !!(vault && vault.check);
    } catch {
      return false;
    }
  }

  /* Set passphrase baru (atau ganti): tulis blob verifikasi ke storage. */
  async function activate(newPass) {
    if (!subtleOk()) throw new Error('Web Crypto tidak tersedia di halaman ini.');
    pass = newPass;
    keys = new Map();
    await chrome.storage.local.set({ vault: { check: await seal(CHECK_TEXT, newPass) } });
  }

  async function deactivate() {
    await chrome.storage.local.remove('vault');
    pass = null;
    keys = new Map();
  }

  /* Verifikasi candidate terhadap blob verifikasi, lalu simpan di memori
     sesi. Cache kunci lama dibuang agar passphrase salah tidak tertinggal. */
  async function unlock(candidate) {
    if (!subtleOk()) throw new Error('Web Crypto tidak tersedia di halaman ini.');
    const { vault } = await chrome.storage.local.get('vault');
    if (!vault || !vault.check) throw new Error('Enkripsi belum aktif.');
    const prevPass = pass;
    const prevKeys = keys;
    pass = candidate;
    keys = new Map();
    try {
      await open(vault.check);
    } catch {
      pass = prevPass;
      keys = prevKeys;
      throw new Error('Passphrase salah.');
    }
    return true;
  }

  const isSealed = (v) => typeof v === 'string' && v.startsWith(PREFIX);
  const needsOpen = (fields) => (fields || []).some((f) => f && f.encrypted);
  const hasPlainSensitive = (fields) => (fields || []).some((f) => f && f.sensitive && !f.encrypted);

  /* Enkripsi di tempat semua field sensitif yang masih polos
     (nilai array/jamak ikut aman: diserialisasi JSON sebelum disegel). */
  async function sealFields(fields) {
    for (const f of fields || []) {
      if (!f || !f.sensitive || f.encrypted) continue;
      f.value = await seal(JSON.stringify(f.value ?? ''), pass);
      f.encrypted = true;
    }
    return fields;
  }

  /* Dekripsi di tempat semua field ber-flag encrypted. */
  async function openFields(fields) {
    for (const f of fields || []) {
      if (!f || !f.encrypted) continue;
      if (!isSealed(f.value)) {
        f.encrypted = false; // flag basi tanpa blob — biarkan nilai apa adanya
        continue;
      }
      f.value = JSON.parse(await open(f.value));
      f.encrypted = false;
    }
    return fields;
  }

  return {
    subtleOk,
    isActive,
    activate,
    deactivate,
    unlock,
    seal,
    sealFields,
    openFields,
    needsOpen,
    hasPlainSensitive,
  };
})();
