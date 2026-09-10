# Changelog — FormPilot

Semua perubahan penting pada extension ini dicatat di sini.
Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/); nomor versi mengikuti pola mayor.minor.patch.

---

## [0.14.1] — 2026-09-10

### Diperbaiki

- **Tombol "Batal" di panel cepat tidak merespons saat mode capture** — form passphrase dibuat lazy (hanya saat pertama kali diminta), sehingga di halaman baru variabel `vaultWrap` masih `null` dan handler Batal melempar `TypeError` di tengah jalan: highlight capture tidak dibersihkan dan form capture tetap terbuka (terkesan mati). Kini diamankan dengan guard null, sama seperti yang sudah dipakai di `toggle()`. Popup extension tidak terdampak karena panel vault-nya elemen statis.

---

## [0.14.0] — 2026-09-09

### Ditambah

- **Update otomatis extension (default OFF)** — pemeriksaan versi baru tiap 6 jam (alarm) dengan sumber default `manifest.json` di branch `main` repo GitHub (URL bisa diedit ke server internal mana pun). Bila ada versi lebih baru: ikon extension diberi badge "BARU", dan section **Update Otomatis** di Kelola menyediakan tombol "🔄 Periksa sekarang" + "⬇ Buka halaman unduhan".
- **Perbarui profil otomatis (default OFF)** — saat capture menemukan profil serupa (URL cocok + field bertumpuk), profil itu kini bisa diperbarui **otomatis** tanpa perlu mengklik tombol 🔄 satu per satu. Punya **section sendiri** di halaman Kelola ("Perbarui Profil Otomatis") — terpisah dari checkbox Pengaturan. Maksimal 5 profil serupa teratas yang diperbarui, dan hasilnya dilaporkan di panel/popup.

### Diubah

- **README.md ditulis ulang** menjadi ringkasan umum extension; riwayat versi dipindah ke file `CHANGELOG.md` ini.
- Panduan (PANDUAN.md) ditambah bagian Update Otomatis.

---

## [0.13.0] — 2026-09-09

### Ditambah

- **Panel & tombol FP selalu terdepan di atas modal** — modal native (`<dialog>` + `showModal()`, umum di app DaisyUI/htmx/Angular) dirender di *top layer* browser dan membuat halaman di luarnya *inert*. FormPilot kini ikut masuk *top layer* (Popover API) dan saat modal terbuka memindahkan dirinya sementara menjadi anak dialog (keturunan dialog kebal inert), lalu kembali normal begitu modal ditutup. Penjaga otomatis menaikkan kembali panel bila tertutup; panel yang tertelan swap halaman (htmx/framework) dipasang ulang sendiri. Browser tanpa Popover API fallback ke z-index maksimum.
- **Capture fokus modal (default ON)** — saat ada modal terbuka, capture hanya mengambil field di dalam modal; filter/pagination di halaman belakang diabaikan. Pengaturannya di ⚙ Kelola → Pengaturan, berlaku tanpa reload.
- **Dukungan widget select enhanced (TomSelect / Select2 / Choices.js)**:
  - *Capture*: field asli yang disembunyikan widget tetap terbaca (visibilitas dinilai dari wrapper widget), dengan nilai cadangan langsung dari DOM widget — generik via konvensi kelas, tanpa selector spesifik halaman.
  - *Fill*: mengisi lewat UI widget-nya (buka dropdown → tunggu render → klik opsi yang cocok) karena widget semacam ini tidak mendengarkan event `change` pada field asli.
- **Highlight capture pada elemen yang terlihat** — ditempel ke wrapper widget, bukan field asli 1px yang tak tampak.
- **Hasil fill lebih jujur** — kegagalan sinkronisasi tampilan widget dilaporkan dengan tanda `⚠ … tampilan widget tidak ikut (alasan)` beserta titik gagalnya (diagnostik).

### Diperbaiki

- Widget bisa diklik di atas modal (sebelumnya hanya tampil).
- Fill field select enhanced tidak lagi butuh klik dua kali (render dropdown ditunggu dengan retry).
- `ReferenceError widgetWhy` yang membuat fill select sukses terlapor gagal.

### Dokumentasi

- README ditambah bagian v0.13; PANDUAN ditambah capture di modal, fill field widget, panel terdepan, pengaturan fokus modal, batasan TomSelect multi AJAX, dan 2 entri troubleshooting baru.

---

## [0.12.x]

### Ditambah

- **Enkripsi field sensitif (Vault)** — nilai password dienkripsi AES-GCM 256-bit + PBKDF2-SHA256 (310.000 iterasi); passphrase per sesi; ubah passphrase & nonaktif (dekripsi massal); nilai terenkripsi ikut terenkripsi di export/backup.
- **0.12.1** — form passphrase dibangun *lazy* (saat benar-benar diminta) agar password manager bawaan browser tidak terpicu oleh field password yang selalu ada di halaman.

---

## [0.11.x]

### Ditambah

- **Setting "grup sesuai URL" (default ON)** — popup & panel hanya menampilkan grup yang punya profil cocok dengan halaman aktif; ada pesan penjelasan bila tidak ada yang cocok.
- **Panduan Cepat di halaman Kelola** — kolom panduan sticky dengan tinggi terbatas viewport, bisa dilipat (posisi diingat).

### Diperbaiki

- **0.11.2** — tabel Grup/Daftar Profile/Fill Log dibatasi ±10 baris dengan scroll dan header menempel.
- **0.11.3** — tahan "Extension context invalidated": instance panel lama membersihkan dirinya sendiri setelah extension di-reload/update.

---

## [0.10.0]

### Ditambah

- **Filter Daftar Profile di Kelola**: search diperdalam (URL pattern, catatan, label & nilai field), dropdown filter Grup dan Tag (tag dropdown disembunyikan otomatis bila tidak ada profil ber-tag), info "Menampilkan X dari Y profile", tombol ✕ Reset.

---

## [0.9.0]

### Ditambah

- **Icon ⚙ di panel cepat** — membuka halaman Kelola anti popup-blocker (via service worker).

### Diperbaiki

- **Penambah baris aman CSP** — suntikan `<script>` dihapus (diblokir CSP halaman); penambahan baris 100% DOM murni (`insertAdjacentHTML`), tombol add asli app dicoba lebih dulu dengan verifikasi per nama input, tombol hapus baris memakai `addEventListener`.

---

## [0.8.0]

### Ditambah

- **Tombol "🔄 Perbarui" saat capture** — mendeteksi profil serupa (URL cocok + field sama) dan menampilkan tombol pembaruan cepat (maks. 5, diurutkan dari yang paling banyak sama); form fresh tidak menampilkan tombol ini.
- **Anti nama duplikat (gaya Windows)** — nama bentrok otomatis jadi `Nama (2)`, `Nama (3)`, … di popup, panel, dan Kelola.

---

## [0.7.x]

### Ditambah

- **Baris dinamis add/remove** (`name="x[]"`) — capture mencatat posisi baris (tabel + urutan); fill menambahkan baris otomatis: fungsi `addElement*` dikenal → heuristik tombol `onclick` "add" → fallback sintesis baris.
- **Select2 AJAX** — capture menyimpan teks opsi terpilih selain value; fill membuat `<option>` baru dari teks tersimpan bila opsi tidak ada di DOM.
- **Log fill ber-reason** — tiap field gagal menyertakan alasan di Fill Log.
- **0.7.1** — kompatibel profil lama (rekonstruksi arrayRow dari atribut name); select bertingkat yang di-reset AJAX di-reselect otomatis.

### Diubah

- **Upload file** dilaporkan terpisah sebagai "diisi manual", tidak dicampur ke daftar gagal.

---

## [0.6.0]

### Ditambah

- **Auto backup** — pilih folder (sebaiknya tersinkron cloud), backup JSON ditulis 1 menit setelah perubahan terakhir (debounce), 10 file terakhir dipertahankan, tombol backup manual & izin ulang.

---

## [0.5.0]

### Ditambah

- **Info capture seragam** — panel cepat & popup tampil identik dengan label eksplisit "Nama profile" dan "Grup".
- **Posisi buka/tutup grup tersimpan** — lintas panel/popup, ikut dimigrasi saat grup di-rename/hapus.

---

## [0.4.0]

### Ditambah

- **Tombol FP bisa digeser** — mode geser ON/OFF (juga di Pengaturan), posisi tersimpan per-browser; panel membuka ke arah yang aman.

---

## [0.2.0]

### Ditambah

- **Grup profile** (CRUD lengkap di versi berikutnya) — grup otomatis dari hostname saat capture.
- **Panel cepat tombol FP** di pojok kanan bawah — daftar profil, Fill, dan Capture tanpa membuka popup; content script otomatis di semua halaman http/https.

---

## [0.1.0]

### Ditambah

- Rilis awal: capture kondisi form, simpan sebagai profil (nama, grup, URL pattern, tag, catatan), fill ulang dengan satu klik, placeholder dinamis (`{{today}}`, `{{timestamp}}`, `{{uuid}}`, dll.), export/import JSON, fill log.
