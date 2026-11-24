# Asisten AI untuk WhatsApp

Tanyakan cuaca, lanjutkan percakapan kemarin, atau kirim foto dan minta bot mengubahnya. Bot ini menghubungkan WhatsApp ke Anthropic atau ChatCombos melalui Baileys. Riwayat percakapan tersimpan di PostgreSQL, dan admin mengatur siapa yang boleh menggunakan bot langsung dari chat.

## Coba di chat

| Kirim ke bot | Yang bisa dilakukan bot |
| --- | --- |
| “Bagaimana cuaca di Bandung sekarang?” | Mengambil data cuaca dari OpenWeatherMap. |
| “Jam berapa waktu Magrib di Surabaya hari ini?” | Mencari jadwal salat sesuai kota. |
| “Buat poster kedai kopi bergaya risograf, ukuran 20 × 10 cm.” | Membuat gambar melalui 9Router dan mengirim hasilnya ke chat. |
| Kirim foto, lalu tulis “Buat pencahayaannya lebih hangat.” | Menggunakan foto sebagai referensi untuk mengedit gambar. |

## Jalankan secara lokal

Siapkan Node.js 20+, npm, database PostgreSQL, dan akses ke salah satu provider AI. Jalankan perintah berikut dari direktori utama proyek.

```sh
npm ci
cp -n .env.example .env
```

Isi `.env` sesuai layanan yang kamu gunakan.

| Pengaturan | Nilai yang perlu diisi |
| --- | --- |
| Database | Sesuaikan `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, dan `DB_DATABASE` dengan PostgreSQL yang sudah berjalan. |
| Admin WhatsApp | Isi `ADMIN_NUMBERS` dengan nomor admin dalam format internasional tanpa tanda `+`. Pisahkan beberapa nomor dengan koma. |
| Chat via Anthropic | Gunakan `AI_PROVIDER=anthropic` dan isi `ANTHROPIC_API_KEY`. Model dapat diatur dengan `CLAUDE_MODEL`. |
| Chat via ChatCombos | Gunakan `AI_PROVIDER=chat-combos`. Isi `CHAT_COMBOS_BASE_URL` hingga path `/v1`, `CHAT_COMBOS_API_KEY`, dan `CHAT_COMBOS_MODEL` (default `chat`). |
| Gambar dan cuaca | Untuk gambar, isi konfigurasi gateway ChatCombos dan `CHAT_COMBOS_IMAGE_MODEL`, termasuk saat chat memakai Anthropic. Untuk cuaca, isi `OPENWEATHER_API_KEY`. |

```sh
npm run start:dev
```

Saat QR pertama muncul di terminal, buka **Perangkat tertaut → Tautkan perangkat** di WhatsApp dan pindai QR. Setelah log menampilkan **Bot WhatsApp terhubung!**, kirim pesan ke akun bot dari nomor admin.

## Kelola akses dari WhatsApp

| Perintah | Siapa yang bisa menggunakan | Fungsi |
| --- | --- | --- |
| `/whitelist add 628123456789 Rina` | Admin | Izinkan nomor untuk chat. Label seperti `Rina` bersifat opsional. |
| `/whitelist list` | Admin | Lihat daftar nomor beserta labelnya. |
| `/whitelist remove 628123456789` | Admin | Cabut akses nomor tersebut. |
| `/reset` | Pengguna yang memiliki akses | Mulai percakapan baru dengan menghapus riwayat chat sendiri. |

## Jalankan dengan Docker

Compose menjalankan service bot dan memakai jaringan eksternal `whatsapp-bot-net`. Siapkan jaringan ini sebelum menyalakan bot. Jika PostgreSQL berjalan di container terpisah, sambungkan juga container database ke jaringan tersebut dan isi `DB_HOST` dengan nama layanan atau alias jaringannya.

```sh
docker network inspect whatsapp-bot-net >/dev/null 2>&1 || docker network create whatsapp-bot-net
docker compose --env-file .env -f docker/docker-compose.yml up -d --build app
docker compose --env-file .env -f docker/docker-compose.yml logs -f app
```

Jika gateway AI berjalan di host Docker, gunakan alamat host yang bisa dijangkau dari container untuk `CHAT_COMBOS_BASE_URL`. Di dalam container, `localhost` mengarah ke container bot sendiri. Compose menyimpan sesi login WhatsApp dan media di volume agar keduanya tersedia setelah container dibuat ulang.

Setelah mengubah `.env`, terapkan nilai baru dengan membuat ulang container.

```sh
docker compose --env-file .env -f docker/docker-compose.yml up -d --force-recreate app
```

## Telusuri kode

Ikuti pesan masuk dari [koneksi WhatsApp](src/whatsapp/whatsapp.service.ts) ke [pemrosesan pesan](src/message/message.service.ts), lalu ke [layanan AI](src/ai/ai.service.ts). Layanan AI menggunakan [tool](src/ai/tools/) untuk mengambil data atau membuat gambar. Penjelasan arsitektur dan alur percakapan tersedia di [dokumentasi proyek](DOKUMENTASI.md).
