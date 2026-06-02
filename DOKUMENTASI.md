# Dokumentasi WhatsApp Bot

Dokumen ini menjelaskan cara kerja setiap bagian dari project secara menyeluruh — dari bagaimana pesan masuk diterima, diolah oleh AI, sampai balasan dikirim kembali ke WhatsApp.

---

## Daftar Isi

1. [Gambaran Besar](#1-gambaran-besar)
2. [Alur Kerja Pesan](#2-alur-kerja-pesan)
3. [Struktur Folder](#3-struktur-folder)
4. [Penjelasan Per File](#4-penjelasan-per-file)
   - [main.ts](#maints)
   - [app.module.ts](#appmodulets)
   - [configuration.ts](#configurationts)
   - [WhatsApp Module](#whatsapp-module)
   - [Message Module](#message-module)
   - [AI Module](#ai-module)
   - [Conversation Module](#conversation-module)
5. [Database](#5-database)
6. [Cara Multi-Bubble Bekerja](#6-cara-multi-bubble-bekerja)
7. [Cara Tool Cuaca Bekerja](#7-cara-tool-cuaca-bekerja)
8. [Docker](#8-docker)
9. [Cara Menjalankan](#9-cara-menjalankan)
10. [Menambah Fitur Baru](#10-menambah-fitur-baru)

---

## 1. Gambaran Besar

Bot ini dibangun dengan arsitektur **modular** menggunakan NestJS. Artinya setiap fitur dipisah menjadi "modul" tersendiri yang punya tanggung jawab jelas dan tidak saling campur aduk.

```
┌─────────────────────────────────────────────────────────┐
│                     NestJS App                          │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐ │
│  │  WhatsApp    │   │   Message    │   │     AI      │ │
│  │   Module     │──▶│   Module     │──▶│   Module    │ │
│  │  (Baileys)   │   │  (Routing)   │   │  (Claude)   │ │
│  └──────────────┘   └──────────────┘   └─────────────┘ │
│                                               │         │
│                      ┌────────────────────────┘         │
│                      ▼                                  │
│             ┌─────────────────┐                         │
│             │  Conversation   │                         │
│             │    Module       │◀── PostgreSQL DB        │
│             │  (History)      │                         │
│             └─────────────────┘                         │
└─────────────────────────────────────────────────────────┘
```

**Teknologi yang digunakan:**
| Teknologi | Fungsi |
|---|---|
| **NestJS** | Framework backend (struktur, dependency injection) |
| **Baileys** | Menghubungkan bot ke WhatsApp |
| **Claude AI** | Otak bot — memproses dan menjawab pesan |
| **TypeORM + PostgreSQL** | Menyimpan riwayat percakapan |
| **OpenWeatherMap** | Data cuaca untuk fitur weather tool |
| **Docker** | Packaging dan deployment ke server |

---

## 2. Alur Kerja Pesan

Ini adalah perjalanan sebuah pesan dari saat dikirim user sampai bot membalas:

```
User kirim "cuaca jakarta"
         │
         ▼
[WhatsApp / Baileys]
  Menerima event 'messages.upsert'
  → Filter: bukan grup? bukan dari diri sendiri? ada teks?
  → Ambil nomor HP dan teks pesan
         │
         ▼
[MessageService]
  → Apakah dimulai dengan '/'?
    ├── Ya  → CommandHandler (/reset, dll)
    └── Tidak → AIService
         │
         ▼
[AIService]
  1. Ambil/buat sesi percakapan dari DB
  2. Ambil 20 pesan terakhir sebagai context
  3. Kirim ke Claude API
  4. Claude menjawab → ingin pakai tool? (stop_reason = 'tool_use')
     └── Ya → Jalankan WeatherTool → kirim hasilnya ke Claude → minta jawaban akhir
  5. Split jawaban berdasarkan '|||' → array bubble
         │
         ▼
[WhatsappService.sendBubbles]
  → Kirim tiap bubble satu per satu dengan jeda 1 detik
         │
         ▼
User menerima balasan (bisa 1 atau beberapa bubble)
```

---

## 3. Struktur Folder

```
whatapps-bot/
│
├── src/
│   ├── main.ts                          → Titik masuk aplikasi
│   ├── app.module.ts                    → Modul utama (root)
│   │
│   ├── common/
│   │   └── config/
│   │       └── configuration.ts        → Membaca nilai dari .env
│   │
│   ├── whatsapp/
│   │   ├── whatsapp.module.ts           → Registrasi modul
│   │   ├── whatsapp.service.ts          → Koneksi Baileys + kirim/terima pesan
│   │   └── whatsapp.types.ts            → Tipe data (IncomingMessage)
│   │
│   ├── message/
│   │   ├── message.module.ts            → Registrasi modul
│   │   ├── message.service.ts           → Router: command vs AI
│   │   └── command.handler.ts           → Menangani /reset dll
│   │
│   ├── ai/
│   │   ├── ai.module.ts                 → Registrasi modul
│   │   ├── ai.service.ts                → Integrasi Claude + tool loop
│   │   └── tools/
│   │       └── weather.tool.ts          → Tool cuaca (OpenWeatherMap)
│   │
│   └── conversation/
│       ├── conversation.module.ts       → Registrasi modul
│       ├── conversation.service.ts      → CRUD history percakapan
│       └── entities/
│           ├── conversation.entity.ts   → Tabel 'conversations' di DB
│           └── message.entity.ts        → Tabel 'messages' di DB
│
├── sessions/                            → Kredensial login WhatsApp (auto-dibuat)
├── docker/
│   ├── Dockerfile                       → Cara build image Docker
│   └── docker-compose.yml               → Jalankan app + database bersama
│
├── .env                                 → Konfigurasi rahasia (tidak di-commit)
├── .env.example                         → Template .env untuk referensi
└── .gitignore                           → File yang tidak ikut di-commit ke git
```

---

## 4. Penjelasan Per File

### `main.ts`

File pertama yang dijalankan Node.js. Tugasnya satu: menyalakan aplikasi NestJS.

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule); // Buat instance NestJS
  app.enableShutdownHooks();                       // Matikan dengan bersih saat CTRL+C
  await app.listen(port);                          // Mulai dengarkan koneksi HTTP
}
```

> **Catatan:** Bot ini tidak benar-benar butuh HTTP server untuk berfungsi — WhatsApp berkomunikasi via WebSocket, bukan HTTP. Port dibuka hanya untuk health check di Docker.

---

### `app.module.ts`

Modul utama yang "merakit" semua bagian aplikasi. Di sini ada tiga hal penting:

**1. ConfigModule** — membaca file `.env`
```typescript
ConfigModule.forRoot({
  isGlobal: true,   // Bisa diakses dari modul manapun tanpa import ulang
  load: [configuration],
})
```

**2. TypeOrmModule** — koneksi ke database PostgreSQL
```typescript
TypeOrmModule.forRootAsync({
  useFactory: (config: ConfigService) => ({
    type: 'postgres',
    synchronize: true,  // ⚠️ Otomatis buat/update tabel dari entity — hanya untuk development!
    entities: [ConversationEntity, MessageEntity],
  }),
})
```

> `synchronize: true` artinya setiap kali app dijalankan, TypeORM akan membandingkan entity di kode dengan tabel yang ada di database, lalu menyesuaikannya otomatis. Di production sebaiknya gunakan migration.

**3. WhatsappModule** — mengaktifkan bot WhatsApp

---

### `configuration.ts`

File ini membungkus semua variabel dari `.env` menjadi objek yang terstruktur dan bertipe.

```typescript
export default () => ({
  database: {
    host: process.env.DB_HOST ?? 'localhost',  // Nilai default jika .env tidak ada
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    // ...
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.CLAUDE_MODEL ?? 'claude-haiku-4-5-20251001',
  },
  // ...
});
```

Lalu di tempat lain bisa diakses dengan:
```typescript
this.config.get('database.host')   // 'localhost'
this.config.get('anthropic.model') // 'claude-haiku-4-5-20251001'
```

---

### WhatsApp Module

#### `whatsapp.service.ts` — Inti koneksi WhatsApp

Ini adalah jembatan antara WhatsApp dan aplikasi kita. Menggunakan library **Baileys** yang berkomunikasi langsung dengan server WhatsApp via WebSocket.

**Lifecycle: `onModuleInit`**

NestJS memanggil `onModuleInit()` otomatis setelah modul siap. Di sinilah koneksi Baileys dimulai:

```typescript
async onModuleInit() {
  await this.connect(); // Dipanggil otomatis saat app start
}
```

**Autentikasi dengan `useMultiFileAuthState`**

```typescript
const { state, saveCreds } = await useMultiFileAuthState('./sessions');
```

Baileys menyimpan informasi login (kredensial) ke folder `./sessions/`. Jika folder ini ada dan berisi file valid → bot langsung terhubung tanpa QR. Jika kosong → bot tampilkan QR code untuk di-scan.

**Event `connection.update`**

Dipanggil setiap kali status koneksi berubah:
- Ada QR baru → tampilkan di terminal
- Koneksi putus → reconnect otomatis (kecuali jika user logout)
- Koneksi terbuka → log sukses

```typescript
if (connection === 'close') {
  // Putus karena logout? Jangan reconnect.
  // Putus karena error/timeout? Reconnect.
  const shouldReconnect =
    (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
  if (shouldReconnect) void this.connect();
}
```

**Event `messages.upsert`**

Event utama — dipanggil setiap ada pesan masuk. Ada beberapa filter keamanan:

```typescript
if (msg.key.fromMe) continue;               // Abaikan pesan yang dikirim bot sendiri
if (remoteJid.endsWith('@g.us')) continue;  // Abaikan pesan grup (format JID grup: xxx@g.us)
if (!text) continue;                        // Abaikan pesan tanpa teks (gambar, sticker, dll)
```

`remoteJid` adalah ID unik di WhatsApp. Format untuk private: `628123456789@s.whatsapp.net`.

**`sendBubbles`**

Mengirim array string satu per satu dengan jeda 1 detik antar pesan:

```typescript
for (let i = 0; i < bubbles.length; i++) {
  await this.sock.sendMessage(jid, { text: bubbles[i] });
  if (i < bubbles.length - 1) {
    await this.delay(1000); // Tunggu 1 detik sebelum bubble berikutnya
  }
}
```

---

### Message Module

#### `message.service.ts` — Router pesan

Fungsinya sederhana: menerima pesan dan menentukan siapa yang harus menanganinya.

```typescript
async handle(phoneNumber: string, text: string): Promise<string[]> {
  if (trimmed.startsWith('/')) {
    return this.commandHandler.handle(phoneNumber, trimmed); // Ke command handler
  }
  return this.aiService.chat(phoneNumber, trimmed);          // Ke AI
}
```

#### `command.handler.ts` — Menangani perintah

Saat ini hanya ada satu command: `/reset`.

```typescript
switch (cmd) {
  case '/reset':
    await this.convService.resetConversation(phoneNumber);
    return ['✅ Riwayat percakapan kamu sudah direset.'];
  default:
    return [`❓ Command "${cmd}" tidak dikenali.`];
}
```

Untuk **menambah command baru**, cukup tambahkan `case` baru di switch ini.

---

### AI Module

#### `ai.service.ts` — Otak bot

Ini adalah file terpenting. Tugasnya:
1. Mengambil riwayat percakapan dari database
2. Mengirimnya ke Claude bersama pesan baru
3. Menangani jika Claude ingin menggunakan tool
4. Menyimpan hasil ke database
5. Mengembalikan jawaban sebagai array bubble

**System Prompt**

Instruksi permanen yang dikirim ke Claude di setiap percakapan:

```typescript
const SYSTEM_PROMPT = `Kamu adalah asisten WhatsApp yang ramah...
Ketika menjawab, kamu bisa membagi jawaban menggunakan delimiter "|||".
Contoh: "Halo! 👋|||Ada yang bisa aku bantu hari ini?"`;
```

**Membangun history percakapan**

TypeORM mengembalikan array `MessageEntity` dari database. Kita konversi ke format yang dimengerti Claude (`Anthropic.MessageParam`):

```typescript
const messages = history.map((msg) => ({
  role: msg.role === 'user' ? 'user' : 'assistant',
  content: msg.content,
}));
messages.push({ role: 'user', content: userMessage }); // Tambah pesan baru di akhir
```

**Tool Use Loop**

Claude tidak langsung memanggil OpenWeatherMap — Claude hanya "minta izin" dengan mengembalikan respons bertipe `tool_use`. Kita yang menjalankan tool-nya, lalu kirim hasilnya kembali ke Claude:

```
[Kita] → "cuaca jakarta" + tools tersedia → [Claude]
[Claude] → stop_reason: 'tool_use', minta get_weather("Jakarta") → [Kita]
[Kita] → jalankan WeatherTool → dapat "Suhu: 32°C..." → [Claude]
[Claude] → stop_reason: 'end_turn', "Di Jakarta sekarang 32°C..." → [Kita]
```

```typescript
while (response.stop_reason === 'tool_use') {
  // 1. Cari tool mana yang diminta Claude
  const toolUseBlock = response.content.find((b) => b.type === 'tool_use');

  // 2. Jalankan tool yang sesuai
  const toolResult = await this.weatherTool.execute(input.city);

  // 3. Kirim hasil tool ke Claude sebagai 'user' message
  messages.push({ role: 'assistant', content: response.content });
  messages.push({
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: toolResult }],
  });

  // 4. Minta jawaban akhir dari Claude
  response = await this.client.messages.create({ ... messages });
  // Loop ulang jika Claude masih mau pakai tool lagi
}
```

**Memecah jawaban menjadi bubble**

```typescript
return textContent
  .split('|||')    // Pisah berdasarkan delimiter
  .map((s) => s.trim())
  .filter(Boolean); // Buang string kosong
```

#### `weather.tool.ts`

Terdiri dari dua bagian:

**`definition`** — Deskripsi tool untuk Claude. Claude membaca ini untuk tahu kapan dan bagaimana cara menggunakan tool ini:

```typescript
readonly definition = {
  name: 'get_weather',
  description: 'Mendapatkan informasi cuaca terkini untuk sebuah kota...',
  input_schema: {
    properties: {
      city: { type: 'string', description: 'Nama kota...' }
    },
    required: ['city'],
  },
};
```

**`execute(city)`** — Implementasi nyata yang memanggil OpenWeatherMap API:

```typescript
const response = await axios.get(`${baseUrl}/weather`, {
  params: { q: city, appid: apiKey, units: 'metric', lang: 'id' },
});
// Ambil data dan format jadi string yang mudah dibaca
return `Cuaca di ${cityName}: 🌡️ ${temp}°C...`;
```

---

### Conversation Module

#### `conversation.service.ts` — Manajemen riwayat percakapan

Bertanggung jawab atas semua operasi database yang berhubungan dengan percakapan.

| Method | Fungsi |
|---|---|
| `getOrCreate(phoneNumber)` | Cari sesi percakapan untuk nomor ini. Jika belum ada, buat baru. |
| `getMessages(id, limit)` | Ambil N pesan terakhir dari sesi ini (urut dari lama ke baru). |
| `addMessage(id, role, content)` | Simpan satu pesan baru ke database. |
| `resetConversation(phone)` | Hapus semua pesan dari sesi nomor ini (dipanggil oleh `/reset`). |

**Kenapa setiap nomor dipisah?**

Karena kita mau Claude punya "memori" per pengguna. Saat user A kirim "namaku Budi", Claude harus ingat itu di pesan berikutnya dari A — tapi tidak boleh "kebocoran" ke user B.

```typescript
// Setiap kali ada pesan, cari/buat sesi untuk nomor tersebut
const conversation = await this.convService.getOrCreate(phoneNumber);
// Ambil historynya
const history = await this.convService.getMessages(conversation.id, 20);
```

#### `conversation.entity.ts` dan `message.entity.ts` — Skema Database

TypeORM menggunakan class dengan decorator untuk mendefinisikan struktur tabel:

**`conversations` table:**
```
id          → UUID, primary key, dibuat otomatis
phone_number → Nomor WA (unik, satu baris per nomor)
created_at  → Kapan sesi dimulai
updated_at  → Kapan pesan terakhir
```

**`messages` table:**
```
id              → UUID, primary key
conversation_id → FK ke tabel conversations
role            → 'user' atau 'assistant'
content         → Isi pesan (teks bebas)
created_at      → Waktu pesan dibuat
```

Relasi: satu `conversation` punya banyak `message` (one-to-many). Jika conversation dihapus, semua message-nya ikut terhapus (`onDelete: 'CASCADE'`).

---

## 5. Database

### Diagram Relasi

```
conversations                 messages
─────────────────────        ──────────────────────────
id (PK, UUID)       ◀──┐    id (PK, UUID)
phone_number            └─── conversation_id (FK)
created_at               role ('user' | 'assistant')
updated_at               content (TEXT)
                         created_at
```

### Contoh Data

**Tabel `conversations`:**
```
id                                   | phone_number | created_at
-------------------------------------|--------------|-------------------
a1b2c3d4-...                         | 628123456789 | 2026-05-20 10:00
e5f6g7h8-...                         | 628987654321 | 2026-05-20 11:00
```

**Tabel `messages`:**
```
id           | conversation_id | role      | content
-------------|-----------------|-----------|-------------------------
uuid-1       | a1b2c3d4-...    | user      | Halo, siapa kamu?
uuid-2       | a1b2c3d4-...    | assistant | Halo! Aku asisten WA...
uuid-3       | a1b2c3d4-...    | user      | cuaca jakarta
uuid-4       | a1b2c3d4-...    | assistant | Di Jakarta sekarang 32°C
```

---

## 6. Cara Multi-Bubble Bekerja

Ketika Claude ingin mengirim beberapa pesan terpisah, ia menggunakan delimiter `|||` dalam jawabannya:

**Claude menjawab:**
```
Oke, aku cek dulu ya! 🔍|||Cuaca di Jakarta saat ini:
🌡️ Suhu: 32°C|||Kelembaban cukup tinggi, 80%. Jaga kesehatan! 💧
```

**AIService memecahnya:**
```typescript
textContent.split('|||')
// Hasil: [
//   "Oke, aku cek dulu ya! 🔍",
//   "Cuaca di Jakarta saat ini:\n🌡️ Suhu: 32°C",
//   "Kelembaban cukup tinggi, 80%. Jaga kesehatan! 💧"
// ]
```

**WhatsappService mengirimnya:**
```
[t=0s]  Bubble 1 dikirim → "Oke, aku cek dulu ya! 🔍"
[t=1s]  Bubble 2 dikirim → "Cuaca di Jakarta saat ini:..."
[t=2s]  Bubble 3 dikirim → "Kelembaban cukup tinggi..."
```

---

## 7. Cara Tool Cuaca Bekerja

Diagram lengkap ketika user mengirim "cuaca surabaya":

```
User: "cuaca surabaya"
        │
        ▼
AIService.chat()
  Kirim ke Claude:
  - system prompt
  - tools: [{ name: 'get_weather', ... }]
  - messages: [...history, { role: 'user', content: 'cuaca surabaya' }]
        │
        ▼
Claude API (response #1)
  stop_reason: 'tool_use'
  content: [{ type: 'tool_use', name: 'get_weather', input: { city: 'Surabaya' } }]
        │
        ▼
WeatherTool.execute('Surabaya')
  GET https://api.openweathermap.org/data/2.5/weather?q=Surabaya&...
  → "Cuaca di Surabaya, ID:\n🌡️ Suhu: 30°C..."
        │
        ▼
Kirim kembali ke Claude:
  messages: [
    ...sebelumnya,
    { role: 'assistant', content: [tool_use block] },
    { role: 'user', content: [{ type: 'tool_result', content: "Cuaca di Surabaya..." }] }
  ]
        │
        ▼
Claude API (response #2)
  stop_reason: 'end_turn'
  content: [{ type: 'text', text: "Di Surabaya sekarang 30°C nih!|||Cukup panas ya..." }]
        │
        ▼
Split → ["Di Surabaya sekarang 30°C nih!", "Cukup panas ya..."]
        │
        ▼
User menerima 2 bubble pesan
```

---

## 8. Docker

### `Dockerfile` — Multi-stage Build

Build dua tahap untuk menghasilkan image yang lebih kecil:

```dockerfile
# Tahap 1: Build (ada semua dev dependencies)
FROM node:20-alpine AS builder
RUN npm ci           # Install semua packages
RUN npm run build    # Compile TypeScript → JavaScript di folder /dist

# Tahap 2: Runner (hanya yang perlu untuk jalan)
FROM node:20-alpine AS runner
RUN npm ci --omit=dev   # Install hanya production packages (tanpa TypeScript, ESLint, dll)
COPY --from=builder /app/dist ./dist  # Ambil hasil build dari tahap 1
```

Hasilnya: image final tidak punya TypeScript compiler, source `.ts`, atau package development — lebih kecil dan lebih aman.

### `docker-compose.yml`

Menjalankan dua service sekaligus:

```yaml
services:
  postgres:          # Database
    image: postgres:16-alpine
    healthcheck: ... # Pastikan database siap sebelum app start

  app:               # Bot kita
    depends_on:
      postgres:
        condition: service_healthy  # Tunggu postgres sehat dulu
    volumes:
      - sessions_data:/app/sessions  # Simpan sesi WA agar tidak hilang saat container restart
```

Variabel di `docker-compose.yml` dibaca dari file `.env` di direktori yang sama.

---

## 9. Cara Menjalankan

### Development (lokal)

**Prasyarat:** Node.js 20+, PostgreSQL berjalan lokal

```bash
# 1. Isi konfigurasi
cp .env.example .env
# Edit .env: isi ANTHROPIC_API_KEY, OPENWEATHER_API_KEY, dan kredensial DB

# 2. Install dependencies
npm install

# 3. Jalankan
npm run start:dev

# 4. Scan QR yang muncul di terminal dengan WhatsApp di HP
```

### Production (Docker)

```bash
# 1. Isi .env di direktori docker/ atau root
cp .env.example .env
# Edit .env dengan nilai production

# 2. Build dan jalankan
docker-compose -f docker/docker-compose.yml up --build -d

# 3. Lihat log (termasuk QR code untuk scan pertama kali)
docker-compose -f docker/docker-compose.yml logs -f app
```

> Setelah scan QR pertama kali, sesi tersimpan di Docker volume `sessions_data`. Saat container di-restart, bot langsung terhubung tanpa scan QR lagi.

---

## 10. Menambah Fitur Baru

### Menambah Command Baru

Edit `src/message/command.handler.ts`, tambahkan case baru:

```typescript
case '/info':
  return ['Ini adalah WhatsApp Bot v1.0\nDibuat dengan NestJS + Claude AI'];

case '/help':
  return ['Command yang tersedia:\n• /reset — hapus riwayat\n• /info — info bot'];
```

### Menambah Tool AI Baru

Misalnya tool untuk cek nilai tukar mata uang:

**1. Buat file baru** `src/ai/tools/currency.tool.ts`:
```typescript
@Injectable()
export class CurrencyTool {
  readonly definition = {
    name: 'get_currency',
    description: 'Cek nilai tukar mata uang...',
    input_schema: { ... }
  };

  async execute(from: string, to: string): Promise<string> {
    // Panggil API nilai tukar
  }
}
```

**2. Daftarkan di `ai.module.ts`:**
```typescript
providers: [AIService, WeatherTool, CurrencyTool],
exports: [AIService],
```

**3. Inject di `ai.service.ts`:**
```typescript
constructor(
  ...,
  private readonly currencyTool: CurrencyTool,
) {}
```

**4. Tambahkan ke daftar tools saat panggil Claude:**
```typescript
tools: [this.weatherTool.definition, this.currencyTool.definition],
```

**5. Tangani di tool_use loop:**
```typescript
if (toolUseBlock.name === 'get_currency') {
  toolResult = await this.currencyTool.execute(input.from, input.to);
}
```

### Mengubah Kepribadian Bot

Edit konstanta `SYSTEM_PROMPT` di `src/ai/ai.service.ts`. Ubah nada bicara, bahasa, atau instruksi sesuai kebutuhan.

### Mengubah Model Claude

Di file `.env`:
```env
CLAUDE_MODEL=claude-sonnet-4-6  # Lebih pintar, lebih mahal
CLAUDE_MODEL=claude-haiku-4-5-20251001  # Lebih cepat, lebih hemat (default)
```
