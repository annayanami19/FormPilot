# 📘 FormPilot — Panduan Penggunaan Lengkap

**FormPilot** adalah ekstensi browser Chrome/Edge (Manifest V3) untuk **siapa pun yang sering mengisi form yang sama berulang kali**: **simpan kondisi form yang sudah kamu isi, lalu isi ulang dengan satu klik** — tanpa server, tanpa helper, tanpa build step.

> Konsepnya tiga langkah: **Capture** (rekam form yang sudah terisi) → **Kelola** (rapikan profil) → **Fill** (isi ulang form kapan pun, di halaman yang cocok).

### Contoh penggunaan

- **Testing / QA aplikasi** — rekam tiap skenario form sebagai profil (mis. `Registrasi — Skenario A`), isi ulang di tiap regresi tanpa ngetik ulang; placeholder `{{today}}`, `{{timestamp}}`, `{{uuid}}` menjaga data uji selalu segar dan unik, dan setiap fill tercatat di **Fill Log** sebagai jejak pengujian.
- **Input data harian** — form admin/internal yang berulang: input transaksi, data master, pengajuan, approval.
- **Formulir berulang lainnya** — pendaftaran, timesheet, entry data pelanggan, dan sejenisnya.

---

## Daftar Isi

1. [Instalasi](#1-instalasi)
2. [Konsep Penting](#2-konsep-penting)
3. [Alur Kerja Harian](#3-alur-kerja-harian)
4. [Capture — Merekam Form](#4-capture--merekam-form)
5. [Fill — Mengisi Ulang Form](#5-fill--mengisi-ulang-form)
6. [Panel Cepat di Halaman Web](#6-panel-cepat-di-halaman-web)
7. [Popup Extension](#7-popup-extension)
8. [Halaman Kelola](#8-halaman-kelola)
9. [Ganti Base URL Massal](#9-ganti-base-url-massal)
10. [Keamanan — Enkripsi Field Sensitif](#10-keamanan--enkripsi-field-sensitif)
11. [Backup Otomatis & Export/Import](#11-backup-otomatis---exportimport)
12. [Placeholder Nilai Dinamis](#12-placeholder-nilai-dinamis)
13. [Batasan yang Perlu Diketahui](#13-batasan-yang-perlu-diketahui)
14. [Troubleshooting](#14-troubleshooting)
15. [Privasi & Penyimpanan Data](#15-privasi--penyimpanan-data)

---

## 1. Instalasi

1. Buka `chrome://extensions` (Chrome) atau `edge://extensions` (Edge).
2. Nyalakan **Developer mode** (toggle di pojok).
3. Klik **Load unpacked** → pilih folder extension FormPilot ini.
4. Pin ikon extension ke toolbar agar mudah dijangkau.

> ⚠️ Folder extension **tidak boleh dipindah/dihapus** selama terpasang — browser me-load langsung dari lokasi itu. Kalau pindah, lakukan Load unpacked ulang dari lokasi baru.

---

## 2. Konsep Penting

| Istilah | Arti |
|---|---|
| **Profile** | Satu "snapshot" kondisi form: kumpulan field + nilai yang tersimpan, lengkap dengan nama, grup, tag, dan URL pattern. |
| **Field** | Satu input di form (input teks, textarea, select, checkbox, radio) beserta selector-nya. |
| **Grup** | Wadah profil, otomatis terbentuk dari **hostname** saat capture (mis. `app.example.com`). Bisa juga dibuat manual. |
| **Tag** | Label opsional untuk mengelompokkan lintas grup (mis. `smoke`, `regression`). Diisi manual di editor. |
| **URL Pattern** | Aturan halaman mana yang cocok dengan profil, gaya glob: `https://app.example.com/quote/**` (`**` = bebas). |
| **Panel cepat** | Tombol bulat **FP** di pojok kanan bawah setiap halaman web + panel yang membuka dari situ. |
| **Vault** | Enkripsi nilai sensitif (password) dengan passphrase milikmu. Lihat [bagian 10](#10-keamanan--enkripsi-field-sensitif). |

---

## 3. Alur Kerja Harian

```
1. Isi form di halaman target seperti biasa
2. Klik 📷 Capture (dari popup atau panel)  → field terdeteksi di-highlight hijau
3. Beri nama → Simpan profile
4. Besoknya: buka form kosong yang URL-nya cocok → klik Fill → selesai ✅
```

---

## 4. Capture — Merekam Form

Bisa dari **dua tempat**, hasilnya sama:

- **Popup**: klik ikon FormPilot di toolbar → **📷 Capture form ini**
- **Panel cepat**: klik tombol **FP** di pojok kanan bawah → **📷 Capture**

### Yang terjadi saat capture

1. Semua field **yang berisi** dideteksi dan langsung **di-highlight garis hijau permanen** — selama form capture masih terbuka kamu bisa lihat persis field mana yang akan tersimpan. Highlight hilang otomatis saat profil disimpan / dibatalkan / panel ditutup. Kalau kamu capture lagi (dari popup maupun panel), highlight lama otomatis diganti yang baru — tidak akan menumpuk.
2. Panel capture terbuka berisi:
   - **Judul halaman** sebagai referensi
   - **Nama profile** (terisi otomatis dari judul halaman, maks. 80 karakter)
   - **Grup** (terisi otomatis dari hostname, mis. `app.example.com`)
   - Info jumlah field terdeteksi (termasuk peringatan bila ada field password)
3. Klik **Simpan profile** → profil baru jadi. Nama otomatis dibuatkan unik (gaya Windows: `… (2)`, `… (3)`) bila sudah ada yang sama.

### Kriteria field yang terdeteksi

- Input teks/textarea: **harus ada isinya**
- Select: harus ada opsi terpilih
- Checkbox/radio: hanya yang **tercentang** yang dicatat
- Tidak diambil: hidden, file upload, tombol, field disabled/readonly

### Capture di halaman dengan modal pop-up

Saat ada modal pop-up (`<dialog>`) terbuka, capture **fokus ke modal**: hanya field di dalam modal yang direkam — filter, pagination, dan field lain di halaman belakang diabaikan supaya profil tidak tercemar. Bisa dimatikan di ⚙ Kelola → Pengaturan (*"Saat modal pop-up terbuka, Capture hanya mengambil field di dalam modal"*, default aktif, berlaku tanpa reload). Kalau modal terbuka tapi fieldnya masih kosong, muncul pesan pengingat untuk mengisi dulu sebelum capture.

Widget select modern (**TomSelect, Select2, Choices.js**) yang menyembunyikan field aslinya tetap terbaca: capture mengenali field lewat tampilan widget-nya dan membaca item terpilih langsung dari widget bila perlu — generik, tanpa tergantung halaman tertentu. Highlight hijau capture kini tampil melingkupi widget-nya (bukan field tersembunyi di baliknya).

### Memperbarui profil lama

Saat capture, FormPilot mendeteksi **profil serupa** (URL cocok + ada field yang sama) dan menampilkan tombol **🔄 Perbarui (N field sama)** — klik untuk menimpa field profil lama dengan hasil capture sekarang, tanpa membuat profil baru.

---

## 5. Fill — Mengisi Ulang Form

1. Buka form kosong yang **URL-nya cocok** dengan profil.
2. Klik **Fill** di popup atau panel cepat.
3. Field terisi otomatis dan **berkelip garis hijau**; field bermasalah **garis merah**.
4. Ringkasan hasil muncul:
   - `✔ N field terisi.`
   - `⚠ N tampilan widget tidak ikut (<field>: <alasan>)` — field asli sudah terisi (form submit benar), tapi tampilan widget select enhanced-nya tidak ikut tersinkron; detail penyebabnya ada dalam kurung.
   - `⏭ N diisi manual (upload file)` — input file memang tidak bisa diisi otomatis (batasan browser).
   - `✖ N gagal: <field> — <alasan>` — mis. field tidak ditemukan, opsi select hilang, field disabled.

Setiap fill juga tercatat di **Fill Log** halaman Kelola (lihat [bagian 8](#8-halaman-kelola)) — berguna sebagai jejak pengujian.

### Field select dengan widget (TomSelect dkk.)

Form modern sering mengganti `<select>` dengan widget yang tidak mendengarkan event `change` pada field asli. Karena itu FormPilot mengisi lewat UI widget-nya sendiri: **membuka dropdown → menunggu isinya selesai dirender → mengklik opsi yang cocok** — tampilan widget ikut menampilkan item terpilih. Dropdown berkedip terbuka sebentar saat fill; itu normal.

---

## 6. Panel Cepat di Halaman Web

Tombol **FP** di pojok kanan bawah → panel berisi daftar profil tergroup:

- **🔍 Cari** — kotak pencarian di atas daftar. Menjangkau **nama, grup, tag, URL pattern, catatan, sampai label & nilai field**. Saat mencari, grup berisi hasil otomatis terbuka, grup tanpa hasil disembunyikan, dan filter "grup sesuai URL" diabaikan agar profil tersembunyi pun bisa ditemukan. Pencarian reset saat panel ditutup.
- **🔓 Geser: ON/OFF** — mode geser tombol FP. Saat ON, tombol bisa ditarik ke mana saja (posisinya tersimpan); saat OFF kembali terkunci di pojok kanan bawah.
- **⚙** — buka halaman Kelola.
- **✕** — tutup panel.
- **Nonaktifkan** — hilangkan tombol FP dari semua halaman (aktifkan ulang dari halaman Kelola → Pengaturan).
- Profil yang URL pattern-nya **cocok dengan halaman aktif** ditandai badge hijau `match`.
- Panel otomatis membuka ke arah yang aman mengikuti posisi tombol (kiri/kanan, atas/bawah).
- **Selalu terdepan di atas modal pop-up** — saat halaman membuka modal (`<dialog>`, yang biasanya membuat halaman di luarnya tak bisa diklik), panel & tombol FP tetap tampil di atasnya dan **tetap bisa diklik**: panel sementara menjadi bagian dari dialog dan kembali normal begitu modal ditutup. Jadi kamu bisa tetap Fill dari panel saat form target berada di dalam modal.

---

## 7. Popup Extension

Klik ikon FormPilot di toolbar:

- Menampilkan **URL tab aktif** dan daftar profil (tergroup, dengan badge `match`).
- **📷 Capture form ini** — lihat [bagian 4](#4-capture--merekam-form).
- **🔍 Cari** — filter cepat nama/grup/tag.
- **Fill** per profil — mengisi halaman aktif.
- **⚙ Kelola** — buka halaman Kelola.

---

## 8. Halaman Kelola

Buka dari **⚙** di panel/popup, atau klik kanan ikon extension → **Options**. Semua manajemen ada di sini:

### 8.1 Pengaturan

| Pengaturan | Fungsi |
|---|---|
| Tampilkan panel cepat | ON/OFF tombol FP di halaman web |
| Dark mode | Mode gelap halaman Kelola |
| Izinkan tombol FP digeser | ON = tombol FP bisa digeser ke mana saja (posisi tersimpan); OFF = terkunci di pojok kanan bawah |
| Grup sesuai URL | Di popup & panel, tampilkan **hanya grup yang punya profil cocok dengan halaman aktif** (default aktif) |
| Fokus Capture ke modal | Saat modal pop-up terbuka, Capture hanya mengambil field di dalam modal — field halaman belakang (filter/pagination) diabaikan (default aktif) |

### 8.2 Grup

- Grup otomatis terbentuk dari hostname saat capture; bisa juga **+ Tambah** manual.
- Per grup tersedia **✎ Rename** (semua profil ikut dipindahkan) dan **🗑 Hapus** (profil di dalamnya kembali ke grup "Umum", tidak ikut terhapus).

### 8.3 Daftar Profile

- Tabel semua profil: nama (+tag), grup, URL pattern, jumlah field, waktu diubah, aksi (**Edit / Duplikat / Hapus**).
- **Filter menyeluruh**: kata kunci mencari di nama, grup, tag, URL pattern, catatan, **sampai label & nilai field** (mis. cari nomor quote tertentu). Ada juga dropdown filter Grup dan Tag (dropdown tag muncul setelah ada profil ber-tag).
- **✕ Reset** membersihkan semua filter.
- **🔗 Ganti Base URL** — fitur massal, lihat [bagian 9](#9-ganti-base-url-massal).

### 8.4 Editor Profile (Edit / + Profile Baru)

| Kolom | Isi |
|---|---|
| Nama | Wajib; dibuatkan unik otomatis bila bentrok |
| Grup | Bebas teks (ada saran dari daftar grup) |
| URL Pattern | Glob: `https://app.example.com/quote/**` (`**` = segala yang setelahnya) |
| Tag | Dipisah koma: `smoke, regression` |
| Catatan | Bebas |
| Field Mapping | Tabel **Selector / Label / Tipe / Nilai** per field + tombol **+ Field** untuk menambah manual |

Catatan field mapping:

- **Selector** adalah CSS selector ke field; selector kandidat cadangan (fallback) ikut tersimpan dari hasil capture.
- **Nilai jamak** ditulis dipisah ` | ` (mis. `A | B`) untuk select multiple / checkbox group.
- Checkbox/radio memakai nilai `true` / `false` (radio menyimpan value opsinya).
- Tipe `password` otomatis ditandai **sensitive** — terkait enkripsi (bagian 10). Field yang sudah terenkripsi tampil kosong dengan keterangan *(terenkripsi — kosongkan agar tidak berubah)*: **biarkan kosong** untuk mempertahankan nilai lama, atau isi nilai baru untuk menggantinya.

### 8.5 Backup Otomatis

- **📁 Pilih folder backup** → aktifkan auto backup (butuh Chrome/Edge terbaru; File System Access API).
- Backup berjalan **1 menit setelah ada perubahan data** (debounce), menulis `formpilot-backup-<tanggal-jam>.json`, **10 file terakhir** yang dipertahankan.
- **💾 Backup sekarang** untuk memicu manual.
- Bila izin folder kedaluwarsa, muncul tombol **🔑 Beri izin ulang**.
- 💡 Tip: pilih folder yang tersinkron OneDrive/Drive agar backup ikut ke cloud.

### 8.6 Update Otomatis

Section sendiri di halaman Kelola (default **mati**): bila diaktifkan, saat capture menemukan **profil serupa** (URL pattern cocok + ada field yang sama), profil itu **langsung diperbarui otomatis** dengan hasil capture sekarang — tanpa perlu mengklik tombol 🔄 satu per satu.

- Maksimal 5 profil serupa teratas yang diperbarui (sama seperti daftar tombol 🔄 Perbarui manual).
- Ringkasan hasilnya muncul di panel/popup: berapa yang diperbarui + namanya.
- Field dengan nilai terenkripsi tetap melalui gerbang passphrase seperti biasa.
- Default mati karena efeknya langsung menulis data — nyalakan hanya bila alur kerjamu memang selalu menimpa profil serupa saat capture ulang.

### 8.7 Export / Import JSON

- **⬇ Export JSON**: unduh `formpilot-export-<tanggal>.json` berisi semua profil + grup.
- **⬆ Import JSON**: gabungkan isi file export — profil duplikat (ID sama) otomatis diberi ID baru, grup dari file ikut ditambahkan.
- Format file export & backup identik — file backup bisa langsung di-Import.
- Bila enkripsi aktif, nilai sensitif di file **tetap terenkripsi** (`enc1:…`) — aman disimpan/dibagikan, dan tetap bisa dipakai di komputer lain dengan passphrase yang sama.

### 8.8 Fill Log

Riwayat fill: waktu, profil, URL, dan hasil (terisi / diisi manual / gagal beserta alasannya). Ada tombol **Hapus log**.

### 8.9 Zone Berbahaya

**🗑 Hapus SEMUA data** — menghapus profil, grup, dan log sekaligus. Tidak bisa dibatalkan; export dulu bila perlu.

### 8.10 Panduan Cepat

Sidebar kanan berisi ringkasan cara pakai. Tombol **▴ Sembunyikan** melipat isinya (judul tetap tampil) — posisi terakhir diingat saat halaman dibuka lagi.

---

## 9. Ganti Base URL Massal

Untuk saat aplikasi **pindah domain/environment** (staging → produksi, dsb.) tanpa mengedit URL Pattern satu per satu:

1. Di **Daftar Profile**, klik **🔗 Ganti Base URL**.
2. Isi **Base URL lama** (saran domain otomatis muncul; kalau semua profil satu domain, terisi langsung) dan **Base URL baru** (tanpa `https://` pun boleh).
3. Perhatikan **preview**: daftar setiap profil yang berubah, pattern lama (dicoret) → pattern baru. Tombol menampilkan jumlah profil terdampak, mis. *Ganti Base URL (12 profile)*.
4. Klik tombolnya → semua terganti sekaligus. Profil dengan origin lain **tidak tersentuh**.

Contoh: 15 profil `https://staging.appku.com/quote/**` diganti ke `https://appku.com` → semua menjadi `https://appku.com/quote/**` (path dipertahankan; bahkan bisa dipakai pindah ke subpath, mis. `https://app.com/v2`).

> 💡 Lebih baik daripada wildcard longgar seperti `https://*.example.com/**` yang berisiko match ke environment yang tidak diinginkan.

---

## 10. Keamanan — Enkripsi Field Sensitif

Field bertipe password **tidak wajib, tapi sangat disarankan**, dienkripsi:

### Mengaktifkan

1. Halaman Kelola → bagian **Keamanan**.
2. Isi **passphrase** (min. 4 karakter) → **🔐 Aktifkan enkripsi**.
3. Semua nilai sensitif yang sudah ada langsung dienkripsi massal.

### Cara kerjanya

- Nilai sensitif dienkripsi **AES-GCM 256-bit**, kunci diturunkan dari passphrase via **PBKDF2-SHA256 (310.000 iterasi)**.
- Data di storage, export JSON, dan file backup ikut terenkripsi — yang tersimpan bukan password aslimu.
- Passphrase **hanya hidup di memori** per halaman/tab. Saat profil dengan field terenkripsi di-Fill (atau capture ber-password disimpan), panel/popup meminta passphrase **sekali per sesi**, lalu aksi lanjut otomatis.
- Di editor, nilai terenkripsi tidak pernah ditampilkan. Biarkan kosong = nilai lama tetap; isi nilai baru = otomatis terenkripsi ulang.
- **🔑 Ubah passphrase** — dekripsi semua lalu segel ulang dengan passphrase baru.
- **🔓 Nonaktifkan (dekripsi semua)** — mengembalikan semua nilai ke polos.

### ⚠️ Yang wajib diingat

- **Passphrase tidak ada mekanisme reset.** Kalau lupa, nilai terenkripsi tidak dapat dipulihkan (kecuali masih punya backup sebelum enkripsi aktif). Simpan di password manager.
- Pemakaian di halaman **http** (non-https) tidak mendukung kriptografi browser — enkripsi/dekripsi lewat panel di halaman http akan ditolak. Popup dan halaman Kelola tidak terpengaruh.

---

## 11. Backup Otomatis & Export/Import

Ringkas: **Backup Otomatis** = rutin & otomatis ke folder pilihanmu (bagian 8.5). **Export/Import** = manual, sekali unduh file JSON (bagian 8.7). **Update Otomatis** = opsi memperbarui profil serupa otomatis saat capture (bagian 8.6). Formatnya identik dan saling bisa di-Import.

---

## 12. Placeholder Nilai Dinamis

Nilai field di editor bisa memakai placeholder yang **diproses saat Fill** (bukan saat capture), jadi selalu segar:

| Placeholder | Hasil | Contoh |
|---|---|---|
| `{{today}}` | Tanggal hari ini, `YYYY-MM-DD` | `2026-09-08` |
| `{{today+30}}` | Tanggal + N hari (offset bebas, boleh minus: `{{today-3}}`) | `2026-10-08` |
| `{{time}}` | Jam `HH:MM` | `14:05` |
| `{{timestamp}}` | Milidetik epoch | `1789025400000` |
| `{{uuid}}` | UUID acak | `3f8a2c…` |

Placeholder tak dikenal dibiarkan apa adanya.

---

## 13. Batasan yang Perlu Diketahui

- **Upload file** tidak bisa diisi otomatis (keamanan browser) — diisi manual; sisanya otomatis.
- **Halaman internal browser** (`chrome://`, web store, dll.) tidak didukung untuk capture/fill.
- **Select2 AJAX**: opsi yang tidak ada di DOM dibuat ulang otomatis dari teks tersimpan saat fill; select bertingkat yang ter-reset oleh AJAX diberi kesempatan terpasang ulang. Widget **TomSelect & Choices.js** juga didukung (capture + fill lewat UI widget-nya). Batasan: TomSelect **multi berbasis AJAX** (opsi muncul setelah mengetik) terisi di field aslinya — form tetap submit benar — tapi tampilan widgetnya belum ikut (ditandai peringatan ⚠ saat fill).
- **Baris dinamis** tabel (input `name="x[]"`): baris yang hilang dicoba dibuat ulang otomatis (maks. 10 baris) memakai tombol add asli aplikasi, dengan fallback sintesis baris.
- Kriptografi di halaman **http** tidak didukung (lihat bagian 10).

---

## 14. Troubleshooting

| Gejala | Solusi |
|---|---|
| Tombol FP / popup tidak muncul atau "Extension context invalidated" setelah reload extension | **Refresh halaman web**-nya — instance lama kehilangan konteks extension dan akan membersihkan dirinya sendiri |
| Tombol FP tertutup modal / tidak bisa diklik saat modal pop-up terbuka | **Refresh halaman web**-nya — panel akan otomatis pindah ke dalam modal dan tetap bisa diklik. Pastikan juga browser cukup baru (Popover API: Chrome/Edge 114+) |
| Hasil fill muncul `⚠ tampilan widget tidak ikut` | Field asli sudah terisi (form tetap submit benar), tapi tampilan widget (TomSelect dkk.) tidak ikut — baca alasan dalam kurungnya. Untuk TomSelect multi berbasis AJAX ini masih batasan (lihat bagian 13) |
| Profil tidak muncul di popup/panel | Cek **URL Pattern** profil, dan cek pengaturan **"grup sesuai URL"** — coba cari lewat 🔍 (pencarian mengabaikan filter URL) |
| Fill gagal: "Field tidak ditemukan" | Struktur halaman berubah → capture ulang, atau perbaiki selector di editor |
| Fill gagal: "Opsi … tidak ditemukan" | Daftar opsi select berubah → capture ulang field tersebut |
| "Izin folder perlu diberikan ulang" | Klik **🔑 Beri izin ulang** di bagian Backup Otomatis |
| Lupa passphrase | Tidak bisa dipulihkan lewat aplikasi — pakai backup sebelum enkripsi aktif, atau buat profil baru |
| Highlight capture tertinggal setelah popup ditutup paksa | Akan terbersihkan otomatis saat capture berikutnya / panel dibuka-ditutup |

---

## 15. Privasi & Penyimpanan Data

- **Semua data tersimpan lokal** di browser (`chrome.storage.local` + IndexedDB untuk handle folder backup). Tidak ada server, tidak ada telemetri, tidak ada data yang dikirim ke mana pun.
- Nilai sensitif yang dienkripsi tetap lokal — file export/backup boleh disimpan di cloud karena isinya terenkripsi (asalkan enkripsi aktif).
- Menghapus extension = data profil hilang. **Export/backup secara rutin.**

---

*FormPilot v0.13.0 · Chrome & Edge (Manifest V3) · Load unpacked, tanpa build step*
