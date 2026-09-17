/* FormPilot — generator data dummy (fitur Generate Profile).
   Global: Gen — dipakai lib/placeholder.js (resolusi token saat fill),
   content/form-agent.js (capture mode generate + {{acak}} agent-side),
   popup/options (cheat-sheet token).
   Semua data bawaan Indonesia; tanpa dependensi & tanpa build step.
   Persona = sekumpulan nilai yang saling konsisten (username diturunkan
   dari nama, email dari username, kota-provinsi-kode pasangan) — dibangun
   SEKALI per eksekusi fill sehingga field "Username" dan "Konfirmasi
   username" memperoleh nilai yang sama, lalu persona baru di fill berikutnya. */

(() => {
  if (window.Gen) return; // idempotent — aman di-inject ulang

  /* ---------- data pools ---------- */

  const NAMA_DEPAN = [
    'Adi', 'Agus', 'Andi', 'Bambang', 'Budi', 'Citra', 'Dewi', 'Dian', 'Eko',
    'Fajar', 'Fitri', 'Gunawan', 'Hadi', 'Indah', 'Joko', 'Kartika', 'Lestari',
    'Maya', 'Nur', 'Putri', 'Ratna', 'Rudi', 'Sari', 'Siti', 'Tono', 'Wahyu',
    'Yanti', 'Yusuf', 'Zahra', 'Bagus', 'Dimas', 'Rina', 'Santoso', 'Wulan',
  ];

  const NAMA_BELAKANG = [
    'Santoso', 'Wijaya', 'Pratama', 'Saputra', 'Hidayat', 'Nugroho', 'Ramadhan',
    'Kusuma', 'Setiawan', 'Wibowo', 'Firmansyah', 'Maulana', 'Halim', 'Susanto',
    'Gunawan', 'Prasetyo', 'Suryana', 'Handoko', 'Anggraini', 'Puspita',
    'Rahayu', 'Lestari', 'Utami', 'Safitri', 'Mahendra', 'Iskandar',
  ];

  /* Enam agama resmi di Indonesia. */
  const AGAMA = [
    'Islam', 'Kristen Protestan', 'Katolik', 'Hindu', 'Buddha', 'Konghucu',
  ];

  /* Kota — provinsi — kode pos dipasangkan agar konsisten satu sama lain. */
  const KOTA = [
    { kota: 'Jakarta Pusat', provinsi: 'DKI Jakarta', pos: '10110' },
    { kota: 'Jakarta Selatan', provinsi: 'DKI Jakarta', pos: '12190' },
    { kota: 'Bandung', provinsi: 'Jawa Barat', pos: '40115' },
    { kota: 'Bekasi', provinsi: 'Jawa Barat', pos: '17111' },
    { kota: 'Bogor', provinsi: 'Jawa Barat', pos: '16123' },
    { kota: 'Semarang', provinsi: 'Jawa Tengah', pos: '50132' },
    { kota: 'Surakarta', provinsi: 'Jawa Tengah', pos: '57111' },
    { kota: 'Surabaya', provinsi: 'Jawa Timur', pos: '60119' },
    { kota: 'Malang', provinsi: 'Jawa Timur', pos: '65112' },
    { kota: 'Yogyakarta', provinsi: 'DI Yogyakarta', pos: '55111' },
    { kota: 'Medan', provinsi: 'Sumatera Utara', pos: '20111' },
    { kota: 'Padang', provinsi: 'Sumatera Barat', pos: '25112' },
    { kota: 'Pekanbaru', provinsi: 'Riau', pos: '28111' },
    { kota: 'Palembang', provinsi: 'Sumatera Selatan', pos: '30111' },
    { kota: 'Bandar Lampung', provinsi: 'Lampung', pos: '35111' },
    { kota: 'Denpasar', provinsi: 'Bali', pos: '80111' },
    { kota: 'Mataram', provinsi: 'Nusa Tenggara Barat', pos: '83111' },
    { kota: 'Makassar', provinsi: 'Sulawesi Selatan', pos: '90111' },
    { kota: 'Manado', provinsi: 'Sulawesi Utara', pos: '95111' },
    { kota: 'Balikpapan', provinsi: 'Kalimantan Timur', pos: '76111' },
    { kota: 'Banjarmasin', provinsi: 'Kalimantan Selatan', pos: '70111' },
    { kota: 'Pontianak', provinsi: 'Kalimantan Barat', pos: '78111' },
    { kota: 'Ambon', provinsi: 'Maluku', pos: '97111' },
    { kota: 'Jayapura', provinsi: 'Papua', pos: '99111' },
  ];

  const JALAN = [
    'Jl. Merdeka', 'Jl. Sudirman', 'Jl. Gatot Subroto', 'Jl. Diponegoro',
    'Jl. Ahmad Yani', 'Jl. Kartini', 'Jl. Melati', 'Jl. Mawar',
    'Jl. Kenanga', 'Jl. Cendana', 'Jl. Anggrek', 'Jl. Flamboyan',
    'Jl. Pahlawan', 'Jl. Veteran', 'Jl. Gajah Mada', 'Jl. Hayam Wuruk',
  ];

  const PEKERJAAN = [
    'Guru', 'Perawat', 'Dokter', 'Apoteker', 'Akuntan', 'Administrasi',
    'Analis', 'Arsitek', 'Desainer', 'Developer', 'Engineer', 'Konsultan',
    'Manajer', 'Marketing', 'Pegawai Negeri Sipil', 'Penjual',
    'Petani', 'Supir', 'Teknisi', 'Wiraswasta',
  ];

  const PERUSAHAAN_AWALAN = ['PT', 'CV', 'UD'];
  const PERUSAHAAN_NAMA = [
    'Maju Jaya', 'Sumber Rejeki', 'Bumi Persada', 'Cahaya Abadi',
    'Karya Mandiri', 'Sentosa Makmur', 'Nusantara Tech', 'Harapan Baru',
    'Tirta Kencana', 'Graha Utama', 'Delta Prima', 'Anugerah Sejahtera',
  ];

  const EMAIL_DOMAIN = [
    'gmail.com', 'yahoo.com', 'ymail.com', 'outlook.com', 'hotmail.com',
  ];

  const HP_AWALAN = [
    '0811', '0812', '0813', '0814', '0821', '0822', '0823', '0851',
    '0852', '0853', '0856', '0857', '0858', '0877', '0878', '0895',
    '0896', '0899', '0831', '0838',
  ];

  /* Kata pendek untuk fallback {{acak}} pada input teks biasa. */
  const KATA = [
    'mawar', 'melati', 'anggrek', 'cendana', 'kenanga', 'flamboyan',
    'halilintar', 'samudra', 'nirwana', 'senja', 'pelangi', 'cakra',
    'gempita', 'kencana', 'mahkota', 'permata', 'baja', 'sakti',
  ];

  const USERNAME_PEMISAH = ['.', '_', ''];

  /* ---------- util acak ---------- */

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const pad = (n, w) => String(n).padStart(w, '0');

  function genPassword() {
    const atas = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const bawah = 'abcdefghijkmnpqrstuvwxyz';
    const angka = '23456789';
    const simbol = '!@#$%&*?';
    const semua = atas + bawah + angka + simbol;
    // Tiap kelas karakter dijamin muncul sekali, sisanya acak (panjang 12)
    let chars = [
      pick([...atas]), pick([...bawah]), pick([...angka]), pick([...simbol]),
    ];
    for (let i = chars.length; i < 12; i++) chars.push(pick([...semua]));
    // Acak ulang urutan supaya 4 karakter wajib tidak selalu di depan
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }

  function genTanggalLahir() {
    // Usia 18–55 tahun ke belakang, format YYYY-MM-DD (format value
    // bawaan <input type="date">)
    const now = new Date();
    const d = new Date(
      now.getFullYear() - randInt(18, 55),
      randInt(0, 11),
      randInt(1, 28)
    );
    return (
      d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2)
    );
  }

  function genNik() {
    // Pola 16 digit NIK: 2 kode provinsi + 2 kab/kota + 2 kecamatan +
    // tanggal lahir DDMMYY + 4 nomor seri. Cukup realistis untuk QA,
    // bukan nomor yang benar-benar terdaftar.
    const tgl = pad(randInt(1, 28), 2);
    const bln = pad(randInt(1, 12), 2);
    const thn = pad(randInt(50, 99), 2);
    return (
      pad(randInt(11, 94), 2) + pad(randInt(1, 99), 2) + pad(randInt(1, 99), 2) +
      tgl + bln + thn + pad(randInt(1, 9999), 4)
    );
  }

  function genHp() {
    return pick(HP_AWALAN) + pad(randInt(0, 99999999), 8);
  }

  function genTelepon() {
    return '(0' + randInt(21, 79) + ') ' + randInt(100, 999) + '-' + pad(randInt(0, 9999), 4);
  }

  /* ---------- persona ---------- */

  function buildPersona() {
    const depan = pick(NAMA_DEPAN);
    const belakang = pick(NAMA_BELAKANG);
    const lokasi = pick(KOTA);
    const pemisah = pick(USERNAME_PEMISAH);
    const uname =
      (depan + pemisah + belakang + randInt(1, 99))
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '');
    return {
      nama: depan + ' ' + belakang,
      nama_depan: depan,
      nama_belakang: belakang,
      username: uname,
      email: uname + '@' + pick(EMAIL_DOMAIN),
      password: genPassword(),
      hp: genHp(),
      telepon: genTelepon(),
      nik: genNik(),
      tgl_lahir: genTanggalLahir(),
      alamat: pick(JALAN) + ' No. ' + randInt(1, 200),
      kota: lokasi.kota,
      provinsi: lokasi.provinsi,
      kode_pos: lokasi.pos,
      agama: pick(AGAMA),
      pekerjaan: pick(PEKERJAAN),
      perusahaan: pick(PERUSAHAAN_AWALAN) + ' ' + pick(PERUSAHAAN_NAMA),
    };
  }

  /* Alias agar token Inggris/varian tetap dikenali. */
  const ALIAS = {
    nama_lengkap: 'nama', full_name: 'nama', firstname: 'nama_depan',
    first_name: 'nama_depan', nama_awal: 'nama_depan',
    lastname: 'nama_belakang', last_name: 'nama_belakang',
    nama_keluarga: 'nama_belakang',
    user: 'username', nama_pengguna: 'username',
    phone: 'hp', phone_number: 'hp', mobile: 'hp', handphone: 'hp',
    ponsel: 'hp', no_hp: 'hp',
    telephone: 'telepon', telp: 'telepon', no_telp: 'telepon',
    city: 'kota', province: 'provinsi', address: 'alamat',
    postal_code: 'kode_pos', postcode: 'kode_pos', zip: 'kode_pos',
    religion: 'agama', job: 'pekerjaan', occupation: 'pekerjaan',
    company: 'perusahaan', birthdate: 'tgl_lahir', birthday: 'tgl_lahir',
    tanggal_lahir: 'tgl_lahir', tgl_lahir: 'tgl_lahir',
  };

  function tokenValue(key, persona, arg) {
    if (key === 'angka') {
      let min = 1;
      let max = 999;
      if (arg) {
        const m = /^(\d+)\s*-\s*(\d+)$/.exec(arg.trim());
        if (m) {
          min = parseInt(m[1], 10);
          max = parseInt(m[2], 10);
        }
      }
      if (max < min) [min, max] = [max, min];
      return String(randInt(min, max));
    }
    if (key === 'kata') return pick(KATA);
    // {{acak}} butuh konteks DOM halaman (opsi select/radio yang benar) —
    // sengaja TIDAK di-resolve di sini; form-agent yang menyelesaikannya
    // saat fill. Pada input teks, agent menggantinya dengan Gen.word().
    if (key === 'acak') return null;
    if (persona && Object.prototype.hasOwnProperty.call(persona, key)) {
      return String(persona[key]);
    }
    return null;
  }

  /* ---------- API publik ---------- */

  const Gen = {
    /* Bangun persona baru (dipanggil sekali per eksekusi fill). */
    buildPersona,

    /* Tanggal lahir acak (YYYY-MM-DD) — dipakai juga agent sebagai
       jaring pengaman saat nilai input date tidak valid. */
    tanggal: genTanggalLahir,

    /* Resolusi satu token. persona boleh null (nilai acak lepas per token).
       Cache per token mentah di persona supaya {{username}} yang muncul
       dua kali menghasilkan nilai yang sama dalam satu fill. */
    generate(name, persona, raw, arg) {
      let key = String(name || '').toLowerCase().replace(/[\s-]+/g, '_');
      if (ALIAS[key]) key = ALIAS[key];
      if (persona) {
        persona.__c = persona.__c || {};
        const cacheKey = String(raw || key);
        if (Object.prototype.hasOwnProperty.call(persona.__c, cacheKey)) {
          return persona.__c[cacheKey];
        }
        if (!Object.prototype.hasOwnProperty.call(persona, key)) {
          // token dikenal tapi belum ada di persona — tambah sekali supaya
          // konsisten untuk sisa fill yang sama
          const fresh = buildPersona();
          if (Object.prototype.hasOwnProperty.call(fresh, key)) {
            persona[key] = fresh[key];
          }
        }
        const val = tokenValue(key, persona, arg);
        if (val != null) {
          persona.__c[cacheKey] = val;
          return val;
        }
        return String(raw || '');
      }
      // Tanpa persona (pemanggil lama / konteks tanpa Gen): nilai acak
      // satu-off per token — perilaku paling aman dan backward-compatible.
      const lone = buildPersona();
      const val = tokenValue(key, lone, arg);
      return val != null ? val : String(raw || '');
    },

    /* Kata acak pendek — fallback {{acak}} pada input teks biasa. */
    word() {
      return pick(KATA);
    },

    /* Heuristik label/name/id/tipe field → token paling masuk akal.
       Urutan cek penting: istilah spesifik (nama perusahaan, nama kota,
       kode pos, tanggal lahir) HARUS dicek sebelum 'nama' generik. */
    inferToken(info) {
      const t = String(info.type || '').toLowerCase();
      const hay = (
        (info.label || '') + ' ' + (info.name || '') + ' ' + (info.id || '')
      ).toLowerCase();
      const has = (re) => re.test(hay);

      // Pilihan berganda → dipilihkan acak dari opsi asli halaman saat fill
      if (t === 'select' || t === 'checkbox' || t === 'radio') return '{{acak}}';
      if (t === 'password') return '{{password}}';
      if (has(/\be-?mail\b/)) return '{{email}}';
      if (has(/kata\s*sandi|password|\bpass\b|sandi/)) return '{{password}}';
      if (has(/\bnik\b|\bktp\b/)) return '{{nik}}';
      if (has(/kode\s*pos|kodepos|postal|\bzip\b/)) return '{{kode_pos}}';
      if (has(/provinsi|province/)) return '{{provinsi}}';
      if (has(/\bkota\b|\bcity\b/)) return '{{kota}}';
      if (has(/agama|religio/)) return '{{agama}}';
      if (has(/perusahaan|company|instansi|organisasi/)) return '{{perusahaan}}';
      if (has(/pekerjaan|jabatan|profesi|occupa|\bjob\b|posisi|position/)) {
        return '{{pekerjaan}}';
      }
      if (has(/alamat|address|jalan|street/)) return '{{alamat}}';
      if (has(/lahir|birth/)) return '{{tgl_lahir}}';
      if (has(/no\.?\s*hp|\bhp\b|hand\s*phone|ponsel|whatsapp|\bwa\b|mobile|phone/)) {
        return '{{hp}}';
      }
      if (has(/telepon|\btel\b|telp/)) return '{{telepon}}';
      if (has(/nama\s*depan|first\s*name|nama\s*awal/)) return '{{nama_depan}}';
      if (has(/nama\s*belakang|last\s*name|nama\s*keluarga/)) return '{{nama_belakang}}';
      if (has(/username|user\s*name|nickname|nama\s*pengguna|\blogin\b/)) {
        return '{{username}}';
      }
      if (has(/\bnama\b|\bname\b/)) return '{{nama}}';

      // Fallback per tipe input
      if (t === 'email') return '{{email}}';
      if (t === 'tel') return '{{hp}}';
      if (t === 'number') return '{{angka:1-999}}';
      if (t === 'date') return '{{tgl_lahir}}';
      if (t === 'textarea') return '{{alamat}}';
      return '{{acak}}'; // teks tanpa petunjuk → kata acak (agent-side)
    },
  };

  window.Gen = Gen;
})();
