# FormPilot

Ekstensi browser (Chrome & Edge, Manifest V3) untuk **siapa pun yang sering mengisi form yang sama berulang kali**: **simpan kondisi form yang sudah kamu isi, lalu isi ulang dengan satu klik**.

Tanpa server, tanpa helper, tanpa build step — cukup **Load unpacked**.

> 📘 Panduan lengkap per fitur: [PANDUAN.md](PANDUAN.md) · 📜 Riwayat versi: [CHANGELOG.md](CHANGELOG.md)

### Contoh penggunaan

- **Testing / QA aplikasi** — rekam tiap skenario form sebagai profil (mis. `Registrasi — Skenario A`), isi ulang di tiap regresi tanpa ngetik ulang; placeholder `{{today}}`, `{{timestamp}}`, `{{uuid}}` dan token data dummy `{{nama}}`, `{{email}}`, `{{acak}}` menjaga data uji selalu segar dan unik.
- **Input data harian** — form admin/internal yang berulang: input transaksi, data master, pengajuan, approval.
- **Formulir berulang lainnya** — pendaftaran, timesheet, entry data pelanggan, dan sejenisnya.

---

## Fitur

- **⚡ Auto Fill** — form yang cocok dengan **profile yang di-pin** (tombol ⚡ di Daftar Profile) bisa terisi tanpa menekan Fill: mode **Tanya dulu** (toast konfirmasi di halaman, default) atau **Langsung isi**; scoring kecocokan field dengan ambang yang bisa diatur, konflik multi-profile selalu ditanya (tidak pernah ditebak), dan field yang sudah terisi tidak pernah ditimpa.
- **Capture & Fill form** — simpan kondisi form yang sudah terisi sebagai profil, isi ulang dengan satu klik; hasil fill dilaporkan per field (terisi / diisi manual / gagal beserta alasannya).
- **⚡ Generate Profile (data dummy)** — sekali klik: struktur form dipindai lalu tiap field diisi token data dummy (`{{nama}}`, `{{email}}`, `{{agama}}`, `{{acak}}`, ...) yang di-generate ulang setiap Fill; satu persona konsisten per eksekusi (username = konfirmasi username, email konsisten dengan nama). Bisa juga dipakai manual lewat token di editor (tombol 🎲). Kolom non-isian (search/filter/pagination) dikecualikan otomatis, dan **elemen apa pun bisa dikecualikan manual lewat tombol 🎯 Ambil di panel FP** — dikelola di card 🚫 Pengecualian Generate di halaman Kelola. Profile hasil Generate ditandai badge **⚡ gen** di semua daftar; penandanya otomatis berpindah saat profile di-update lewat jalur sebaliknya (Capture menghapusnya, Generate menyalakannya).
- **Panel cepat tombol FP** — tombol bulat di pojok kanan bawah setiap halaman: daftar profil, cari, Fill, bahkan Capture & Generate, tanpa membuka popup. Bisa digeser, posisinya tersimpan.
- **Pintar di dalam modal pop-up** — saat halaman membuka modal (`<dialog>`), panel tetap tampil paling depan dan tetap bisa diklik; capture pun otomatis **fokus ke field di dalam modal** saja sehingga profil tidak tercemar filter/pagination di belakangnya.
- **Paham widget select modern** — **TomSelect, Select2, dan Choices.js** didukung: capture membaca nilai dari field yang disembunyikan widget, dan fill mengisi lewat UI widget-nya (buka dropdown → klik opsi) sehingga tampilannya ikut terisi.
- **Grup & pencarian** — profil dikelompokkan per aplikasi/domain, filter "grup sesuai URL" menjaga daftar selalu relevan, pencarian menjangkau sampai label & nilai field.
- **Placeholder dinamis & data dummy** — `{{today}}`, `{{today+30}}`, `{{time}}`, `{{timestamp}}`, `{{uuid}}` plus token dummy Indonesia (`{{nama}}`, `{{email}}`, `{{hp}}`, `{{nik}}`, `{{agama}}`, `{{kota}}`, `{{angka:1-999}}`, `{{acak}}`, ...) di-resolve saat fill agar data uji selalu segar.
- **Keamanan** — field password bisa dienkripsi (AES-GCM + PBKDF2) dengan passphrase milikmu; passphrase tidak pernah disimpan.
- **Keamanan data** — auto backup ke folder pilihanmu (termasuk folder cloud), export/import JSON, fill log sebagai jejak pengujian.
- **Baris dinamis & select AJAX** — baris tabel `name="x[]"` yang hilang dibuat ulang otomatis; opsi select AJAX yang tidak ada di DOM dibuat ulang dari teks tersimpan.
- **Perbarui profil otomatis (opsional)** — saat capture menemukan profil serupa, profil itu bisa diperbarui otomatis tanpa klik manual (default OFF).
- **Cek update otomatis (opsional)** — extension memeriksa sendiri ketersediaan versi baru dan menandai ikonnya bila ada (default OFF).

---

## Instalasi (sekali saja)

1. Buka `chrome://extensions` (Chrome) atau `edge://extensions` (Edge).
2. Nyalakan **Developer mode** (toggle).
3. Klik **Load unpacked** → pilih folder repo ini (yang berisi file `manifest.json`).
4. Pin ikon extension ke toolbar.

> Folder ini **tidak boleh dipindah/dihapus** selama extension terpasang (browser me-load langsung dari sini). Kalau pindah, tinggal Load unpacked ulang dari lokasi baru.

## Cara Pakai (ringkas)

```
1. Isi form di halaman target seperti biasa
2. Klik 📥 Capture (dari popup atau tombol FP) → beri nama → Simpan profil
3. Besoknya: buka form kosong → klik Fill di profil yang ber-badge "match" → selesai ✅
```

Kelola profil, grup, filter, enkripsi, backup, dan log ada di halaman **⚙ Kelola** — buka dari ikon ⚙ di panel/popup. Langkah demi langkah lengkap dengan gambaran tiap halaman ada di [PANDUAN.md](PANDUAN.md).

## Pengaturan

| Pengaturan | Fungsi | Default |
|---|---|---|
| Tampilkan panel cepat | ON/OFF tombol FP di halaman web | ON |
| Dark mode | Mode gelap halaman Kelola | OFF |
| Izinkan tombol FP digeser | Tombol FP bisa ditarik ke mana saja | OFF |
| Grup sesuai URL | Hanya tampilkan grup yang cocok dengan halaman aktif | ON |
| Fokus Capture ke modal | Saat modal terbuka, Capture hanya mengambil field di dalam modal | ON |
| Kecualikan field non-isian saat Generate | Kolom search/filter/pagination dilewati ⚡ Generate — kata kunci & daftar pengecualian elemen ada di card 🚫 Pengecualian Generate | ON |
| Auto Fill | Mode (Mati/Tanya dulu/Langsung isi) + ambang kecocokan — hanya profile yang di-pin ⚡ di Daftar Profile yang dipertimbangkan (card ⚡ Auto Fill) | Tanya dulu |
| Notif Auto Fill | Durasi (berwaktu default 30 dtk / tetap tampil) — toast-nya bisa digeser ke mana saja, posisinya tersimpan (card ⚡ Auto Fill) | 30 detik |
| Perbarui profil otomatis | Capture yang menemukan profil serupa langsung memperbaruinya (section sendiri di Kelola) | OFF |
| Update otomatis | Periksa versi baru extension tiap 6 jam dari sumber versi (bisa diedit); ikon diberi tanda bila ada yang lebih baru | OFF |

## Privasi & Penyimpanan

- **Semua data tersimpan lokal** di browser (`chrome.storage.local`). Tidak ada server, tidak ada telemetri — script hanya berjalan di halaman, tidak mengirim data ke mana pun.
- ⚠️ Data hilang jika extension di-remove → **export/backup secara rutin**.

## Hal yang Perlu Diketahui

- Halaman `chrome://`, Web Store, dan sejenisnya tidak bisa di-capture/di-fill.
- Upload file tidak bisa diisi programatik (batasan keamanan browser) — dilaporkan terpisah sebagai "diisi manual".
- TomSelect **multi berbasis AJAX** terisi di field aslinya (form submit benar), tampilan widgetnya belum ikut — ditandai peringatan saat fill.
- Kriptografi (enkripsi) tidak tersedia di halaman http non-https.
- Setelah mengubah kode: `chrome://extensions` → **↻ Reload** pada kartu extension → refresh tab target.

## Struktur Kode

```
manifest.json             # MV3, content script otomatis + host permission http/https
popup/                    # UI harian: daftar profil tergroup, capture, fill
options/                  # Pengaturan, kelola profil, editor mapping, export/import, fill log
content/form-agent.js     # agent self-contained: scan/capture/fill di halaman (termasuk widget select)
content/widget.js         # panel cepat tombol "FP" di pojok kanan bawah (Shadow DOM, tahan modal)
lib/db.js                 # wrapper chrome.storage.local + CRUD grup + grouping/matching
lib/placeholder.js        # resolver {{...}} (tanggal/waktu/uuid + delegasi ke Gen)
lib/generator.js          # Gen — generator data dummy (persona Indonesia, inferToken, {{acak}})
lib/vault.js              # enkripsi nilai sensitif (AES-GCM + PBKDF2)
lib/backup.js             # auto backup ke folder pilihan user
CHANGELOG.md              # riwayat perubahan per versi
PANDUAN.md                # panduan penggunaan lengkap
icons/                    # ikon + script generator (make-icons.ps1)
```

## Rencana Selanjutnya (backlog)

- Custom data pool generator (edit sendiri daftar nama/agama/kota di halaman Kelola)
- Multi-value boundary (satu profil, banyak baris data — data-driven testing)
- Skenario multi-step (isi beberapa halaman berurutan sebagai satu rangkaian)
- Dukungan shadow DOM & iframe
- Simulasi ketik-pilih untuk TomSelect multi berbasis AJAX (agar tampilan widgetnya ikut terisi)
