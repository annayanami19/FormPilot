# FormPilot

Ekstensi browser (Chrome & Edge, Manifest V3) untuk **siapa pun yang sering mengisi form yang sama berulang kali**: simpan kondisi form yang sudah kamu isi, lalu isi ulang dengan satu klik.

Tanpa server, tanpa helper, tanpa build step — cukup **Load unpacked**.

### Contoh penggunaan

- **Testing / QA aplikasi** — rekam tiap skenario form sebagai profile (mis. `Registrasi — Skenario A`), lalu isi ulang di tiap regresi tanpa ngetik ulang; placeholder `{{today}}`, `{{timestamp}}`, `{{uuid}}` menjaga data uji selalu segar dan unik.
- **Input data harian** — form admin/internal yang berulang: input transaksi, data master, pengajuan, approval.
- **Formulir berulang lainnya** — pendaftaran, timesheet, entry data pelanggan, dan sejenisnya.

---

## Instalasi (sekali saja)

1. Buka `chrome://extensions` (Chrome) atau `edge://extensions` (Edge).
2. Nyalakan **Developer mode** (toggle).
3. Klik **Load unpacked** → pilih folder repo ini (yang berisi file `manifest.json`).
4. Pin ikon extension ke toolbar.

> Folder ini **tidak boleh dipindah/dihapus** selama extension terpasang (browser me-load langsung dari sini). Kalau pindah, tinggal Load unpacked ulang dari lokasi baru.

## Cara Pakai

### Menyimpan form (sekali per skenario)
1. Buka halaman target, **isi form seperti biasa**.
2. Klik ikon extension → **📷 Capture form ini**.
3. Cek jumlah field terdeteksi, beri nama profile (mis. `Registrasi — Skenario A`), klik **Simpan profile**.
4. URL pattern otomatis terisi `<origin>/**` (cocok untuk semua halaman domain itu) — bisa diubah di **⚙ Kelola**.

### Mengisi ulang
1. Buka form yang kosong.
2. Klik ikon extension → profile dengan URL cocok muncul paling atas dengan badge **match**.
3. Klik **Fill** → semua field terisi (hijau), yang gagal dilaporkan (merah) di bawah.

### Kelola & backup
Buka **⚙ Kelola**:
- Edit/duplikat/hapus profile, edit mapping field manual (selector, label, tipe, nilai).
- **Manajemen Grup (CRUD)** — section "Grup": tambah grup baru, **rename** (semua profile di dalamnya ikut pindah), atau **hapus** (profile kembali ke grup "Umum"). Grup kosong pun tetap tersimpan.
- **Dark mode** — centang di bagian Pengaturan; preferensinya tersimpan.
- **Auto backup (v0.6)** — di ⚙ Kelola → Backup Otomatis: pilih folder (sebaiknya yang tersinkron OneDrive/Drive), aktifkan toggle-nya. Setiap ada perubahan data, backup file JSON ditulis **1 menit setelah perubahan terakhir** (debounce) — bukan tiap menit. 10 file terakhir disimpan. Nonaktif = tidak ada yang berjalan. Setelah restart browser, izin folder kadang perlu diberikan ulang satu klik ("🔑 Beri izin ulang").
- **⬇ Export JSON** → download semua profile + grup sebagai file backup. **Lakukan ini rutin** (misal tiap Jumat).
- **⬆ Import JSON** → gabungkan hasil export (ke PC baru, atau ke rekan tim); daftar grup ikut digabungkan.

## Grup & Panel Cepat (v0.2)

- **Grup profile** — tiap profile punya grup (mis. nama aplikasi / domain). Popup & panel menampilkannya sebagai section yang bisa dilipat; grup yang berisi profile yang cocok dengan URL aktif tampil paling atas. Saat capture, grup otomatis terisi hostname halaman.
- **Panel cepat di pojok kanan bawah** — di setiap halaman web muncul tombol bulat **FP**: klik untuk membuka daftar profile, **Fill**, bahkan **Capture** — tanpa perlu klik ikon extension.
  - Nonaktifkan lewat tombol **"Nonaktifkan"** di panel, atau centang/hilangkan centang di **⚙ Kelola → Pengaturan**.
- Karena panel harus muncul otomatis di semua halaman, extension sekarang memakai host permission `http/https <all_urls>` dan content script otomatis. Script hanya berjalan lokal, tidak mengirim data ke mana pun.

- **Tombol FP bisa digeser (v0.4)** — klik **"🔓 Geser: ON"** di panel (atau centang di ⚙ Kelola → Pengaturan), lalu tarik tombol FP ke posisi mana saja; posisinya tersimpan per-browser. Matikan lagi (🔒 OFF) untuk mengunci kembali di pojok kanan bawah. Panel selalu membuka ke arah yang aman (tidak keluar layar) mengikuti posisi tombol.
- **Info capture seragam (v0.5)** — form capture di panel cepat & popup tampil identik: judul halaman + "N field terdeteksi" (plus peringatan field password), dengan **label eksplisit "Nama profile" dan "Grup"** di atas input (tidak lagi mengandalkan placeholder yang ketutup saat terisi).
- **Posisi buka/tutup grup tersimpan (v0.5)** — grup yang kamu lipat/buka di panel maupun popup diingat permanen (storage extension — aman walau browser ditutup); rename/hapus grup di Kelola ikut memigrasi posisinya.

## Field Kompleks (v0.7)

Penanganan khusus untuk form ala digireview (`/project/create` dkk):

- **Baris dinamis add/remove** (Quote Number, File Lampiran) — capture mencatat posisi baris (tabel asal + urutan), bukan selector generik. Saat fill, baris yang belum ada **ditambahkan otomatis**: prioritas fungsi `addElement*` global yang dikenal (`addElementQuote`, `addElementLampiran`, `addElementLampiranUrl`), lalu heuristik tombol `onclick` "add" di form-group yang sama (diverifikasi per nama input, jadi tombol yang cuma membuka modal diabaikan).
- **Select2 AJAX** (Nama Pelanggan, dll) — capture menyimpan **teks opsi terpilih** selain value-nya. Saat fill, kalau opsi tidak ada di DOM (khas dropdown AJAX), agent membuat `<option>` baru dari teks tersimpan lalu trigger `change` — widget select2 ikut tersinkron.
- **Upload file** — tidak mungkin diisi programatik (batasan keamanan browser). Field `type=file` kini dilaporkan terpisah sebagai **"diisi manual"**, tidak lagi dicampur ke daftar gagal.
- **Log fill ber-reason** — tiap field gagal kini menyertakan alasannya di riwayat log (⚙ Kelola): mis. `Isi quote number — Baris ke-2 belum ada & gagal ditambah otomatis`, sehingga penyebabnya tidak perlu ditebak lagi.
- **Kompatibel profile lama & select bertingkat (v0.7.1)** — profile hasil capture sebelum v0.7 tetap bisa mengisi baris dinamis (urutan baris direkonstruksi dari atribut `name`); select yang dikosongkan ulang oleh AJAX bertingkat (mis. Unit di-load ulang setelah Divisi berubah) di-reselect otomatis. Kekurangan profile lama ditandai di alasan log: *"capture ulang"* — untuk select, capture ulang **wajib** agar teks opsinya tersimpan.

## Update Profile & Anti-Duplikat (v0.8)

- **Tombol "Perbarui" saat capture** — setelah capture, extension mendeteksi profile serupa (URL pattern cocok **dan** ada field yang sama dengan hasil capture). Kalau ketemu, panel capture menampilkan daftar tombol **🔄 <nama profile> (N field sama)** — klik untuk menimpa field profile itu dengan capture terbaru. Form yang masih fresh (tidak ada yang serupa) tidak menampilkan tombol ini, jadi aman dari salah klik. Kandidat ditampilkan maksimal 5, diurutkan dari field yang paling banyak sama.
- **Anti nama duplikat (gaya Windows)** — menyimpan/rename/duplikat profile dengan nama yang sudah dipakai otomatis jadi `Nama (2)`, `Nama (3)`, dst. (tidak peka huruf besar/kecil). Berlaku di popup, panel cepat, dan halaman Kelola.

## Pengaturan di Panel Cepat & Jembatan Fungsi Halaman (v0.9)

- **Icon ⚙ di panel cepat** — header panel kini punya tombol **⚙ Pengaturan** di sebelah tombol ✕ yang membuka halaman Kelola (popup blocker-proof: dikirim via service worker extension).
- **Penambah baris aman CSP** — extension berjalan di *isolated world*; fungsi `addElement*` milik halaman tidak terlihat dan disuntikkan `<script>` kini **dihapus** karena dilanggar CSP halaman (`script-src` tanpa `'unsafe-inline'`). Penggantinya 100% DOM murni: tombol add asli app dicoba lebih dulu (diverifikasi per nama input, baris samping yang ikut terbuat ikut dibuang), lalu fallback membangun baris langsung via `insertAdjacentHTML` — input hasil sintesis tetap terbaca `FormData` halaman saat submit, dan tombol hapus barisnya memakai `addEventListener` (bukan onclick inline) sehingga tetap berfungsi di bawah CSP ketat.

## Filter Daftar Profile (v0.10)

Halaman ⚙ Kelola → Daftar Profile kini punya **kotak filter** di atas tabel, bukan sekadar search teks:

- **Dropdown Grup** — tampilkan hanya profile dari satu grup (domain/app) tertentu.
- **Dropdown Tag** — tampilkan hanya profile yang punya tag terpilih. Tag itu opsional (diisi manual via ⚙ Kelola → Edit → "Tag (pisah koma)"); kalau belum ada satu pun profile ber-tag, dropdown ini **disembunyikan otomatis** dan muncul kembali begitu ada tag.
- **Search yang diperdalam** — kata kunci kini juga menyentuh URL pattern, catatan, dan **label + nilai field** (mis. ketik nomor quote/LOP tertentu untuk menemukan profile yang memakainya).
- **Info hasil** — "Menampilkan X dari Y profile" saat filter aktif, plus pesan kosong yang jelas bedakan antara "belum ada profile" dan "tidak ada yang cocok dengan filter".
- **✕ Reset** — bersihkan semua filter sekaligus. Pilihan dropdown dipertahankan saat data berubah (capture/update/impor), dan otomatis kembali ke "Semua" kalau grup/tag-nya sudah tidak ada.

## Filter Grup Sesuai URL & Panduan di Kelola (v0.11)

- **Tahan "Extension context invalidated" (v0.11.3)** — setelah extension di-reload/update, instance panel lama yang tertinggal di tab lama tidak lagi melempar error tiap panggilan `chrome.storage`: konteksnya dideteksi lewat `chrome.runtime.id`, widget basi membersihkan dirinya sendiri dan berhenti diam. Tab cukup di-refresh sekali untuk mendapat panel versi baru.
- **Tabel ±10 baris + scroll (v0.11.2)** — tabel Grup, Daftar Profile, dan Fill Log dibatasi tingginya ±10 baris; lebih dari itu muncul scrollbar di dalam wadah tabel, dengan header kolom yang tetap menempel saat discroll.
- **Setting "grup sesuai URL" (default ON)** — di ⚙ Kelola → Pengaturan ada checkbox baru: kalau aktif, popup & panel cepat hanya menampilkan grup yang punya profile cocok dengan URL halaman aktif; grup lain disembunyikan supaya daftar selalu relevan. Matikan checkboxnya untuk melihat semua grup. Kalau tidak ada satupun grup yang cocok, muncul pesan penjelasan (bukan daftar kosong tanpa konteks).
- **Panduan penggunaan di halaman Kelola** — ruang kosong di sisi kanan halaman ⚙ Kelola kini berisi kolom **📘 Panduan Cepat** (cara capture, fill, kelola, placeholder dinamis & backup). Layout-nya dua kolom; kolom panduan sticky mengikuti scroll di layar lebar dengan **tinggi dibatasi setinggi viewport** — sisanya discroll di dalam panel, jadi tidak pernah menimpa navbar dan selalu terlihat utuh. Di layar sempit panduan turun ke bawah konten secara otomatis.

## Placeholder Dinamis

Nilai field bisa memakai template yang diresolve **saat fill** (bukan saat disimpan):

| Placeholder | Hasil |
|---|---|
| `{{today}}` | `2026-09-07` (hari ini) |
| `{{today+30}}` / `{{today-7}}` | tanggal digeser N hari |
| `{{time}}` | `14:35` |
| `{{timestamp}}` | epoch ms (selalu unik — cocok untuk email `user+{{timestamp}}@example.com`) |
| `{{uuid}}` | UUID acak |

## Hal yang Perlu Diketahui

- **Data disimpan di `chrome.storage.local`** (storage internal extension):
  - ✅ Aman dari "Clear browsing data" biasa (cache/cookies).
  - ⚠️ **Hilang jika extension di-remove** atau profil browser dihapus → karena itu **Export JSON secara rutin**.
- Field yang didukung: `input` (semua kecuali file), `textarea`, `select` (termasuk multi-select), `checkbox`, `radio`. Field **password ikut tercapture** dan ditandai `sensitive` (muncul peringatan di popup).
- Fill kompatibel dengan **React/Vue/Angular** — nilai diset via native setter + event `input`/`change` bubbling.
- Jika developer mengubah struktur form dan selector kedaluwarsa: agent otomatis mencoba fallback selector lalu **rescue by label**; kalau masih gagal, perbaiki selector manual di **⚙ Kelola → Edit**.
- Halaman `chrome://`, Web Store, dan sejenisnya tidak bisa di-capture/di-fill.
- Belum didukung (backlog): shadow DOM, iframe, form multi-step.

## Struktur Kode

```
manifest.json             # MV3, content script otomatis + host permission http/https
popup/                    # UI harian: daftar profile tergroup, capture, fill
options/                  # Pengaturan, kelola profile, editor mapping, export/import, fill log
content/form-agent.js     # agent self-contained: scan/capture/fill di halaman
content/widget.js         # panel cepat tombol "FP" di pojok kanan bawah (Shadow DOM)
lib/db.js                 # wrapper chrome.storage.local + CRUD grup + grouping/matching
lib/placeholder.js        # resolver {{...}}
lib/vault.js              # enkripsi nilai sensitif (AES-GCM + PBKDF2)
lib/backup.js             # auto backup ke folder pilihan user
icons/                    # ikon + script generator (make-icons.ps1)
```

Setelah mengubah kode: buka `chrome://extensions` → klik **↻ Reload** pada kartu extension → refresh tab target.

## Rencana Selanjutnya (backlog)

- Data generator/faker (placeholder data acak: nama, email, telepon)
- Multi-value boundary (satu profil, banyak baris data — data-driven testing)
- Skenario multi-step (isi beberapa halaman berurutan sebagai satu rangkaian)
- Dukungan shadow DOM & iframe
