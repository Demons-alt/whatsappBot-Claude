import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import makeWASocket, {
  Contact,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  toNumber,
  useMultiFileAuthState,
  WACallEvent,
  WAMessage,
} from '@whiskeysockets/baileys';

const LID_JID_RE = /@(hosted\.)?lid$/;
const STICKER_FALLBACK_TEXT =
  'Hehe, aku belum ngerti kalau dikirim stiker 🙈 Coba tulis pesannya pakai teks ya!';
const MAX_TRACKED_FORWARDS = 300;

// Jeda antar-obrolan saat catch-up startup, biar pesan keluarnya nggak berondong
// ke banyak nomor sekaligus.
const STARTUP_CATCHUP_DELAY_MS = 3000;

// Pesan yang tiba lebih tua dari ini (dibanding waktu sekarang) dianggap "nyangkut"
// selagi bot offline — bukan cuma delay jaringan biasa.
const OFFLINE_APOLOGY_THRESHOLD_MS = 5 * 60 * 1000;
const OFFLINE_APOLOGY_LINES = [
  'Waduh maaf banget baru bales, tadi lagi kejebak macet parah 🙏',
  'Sori ya lama bales, tadi hp-ku ketinggalan di tas 😅',
  'Maaf baru sempat buka chat, tadi lagi rapat mendadak!',
  'Aduh maaf banget, td lagi di jalan jadi telat balesnya 🙈',
];

// Tunggu selama ini sejak pesan teks terakhir sebelum benar-benar membalas — biar
// beberapa pesan beruntun dari orang yang sama dianggap satu obrolan, bukan dibalas
// satu-satu.
const TEXT_BATCH_DEBOUNCE_MS = 5_00;

interface PendingTextBatch {
  parts: string[];
  remoteJid: string;
  hasStale: boolean;
  timer: ReturnType<typeof setTimeout>;
}

type SupportedImageMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp';
const SUPPORTED_MIMES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);
import { Boom } from '@hapi/boom';
import * as qrcode from 'qrcode-terminal';
import { MessageService } from '../message/message.service';
import { WhitelistService } from '../whitelist/whitelist.service';
import { PendingMessageService } from '../whitelist/pending-message.service';
import {
  WhitelistApprovedEvent,
  WhitelistEventBus,
} from '../whitelist/whitelist-events';

const BUBBLE_DELAY_MS = 1000;

@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);
  private sock: ReturnType<typeof makeWASocket> | null = null;

  /** Best-effort JID→display-name cache, filled from contacts and message pushNames. */
  private readonly contactNames = new Map<string, string>();

  /** Forwarded-notification message id → original sender's phone number, so an admin
   *  quote-replying to that notification relays their reply straight to that number. */
  private readonly forwardedMessages = new Map<string, string>();

  /** Numbers already apologized to since the last reconnect — one apology per gap. */
  private readonly apologizedThisSession = new Set<string>();

  /** Buffered text messages per number, waiting out the debounce before one combined reply. */
  private readonly textBatches = new Map<string, PendingTextBatch>();

  /** Ensures the startup catch-up only runs once per process, not on every reconnect. */
  private hasCheckedUnanswered = false;

  constructor(
    private readonly messageService: MessageService,
    private readonly whitelistService: WhitelistService,
    private readonly pendingMessageService: PendingMessageService,
    private readonly whitelistEventBus: WhitelistEventBus,
  ) {}

  async onModuleInit() {
    // A number just got whitelisted — if they were waiting on a reply, send it now.
    this.whitelistEventBus.on('approved', (event: WhitelistApprovedEvent) => {
      void this.handleApproval(event.phoneNumber);
    });

    await this.connect();
  }

  private async connect() {
    const { state, saveCreds } = await useMultiFileAuthState('./sessions');
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['WhatsApp Bot', 'Chrome', '1.0.0'],
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.logger.log('Scan QR code berikut untuk login:');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !==
          DisconnectReason.loggedOut;

        this.logger.warn(`Koneksi terputus. Reconnect: ${shouldReconnect}`);
        if (shouldReconnect) {
          void this.connect();
        }
      } else if (connection === 'open') {
        this.logger.log('✅ Bot WhatsApp terhubung!');
        // Sesi baru — beri kesempatan minta maaf lagi kalau ada nomor yang tertunda.
        this.apologizedThisSession.clear();

        // Hanya sekali per start-up proses, bukan setiap kali reconnect.
        if (!this.hasCheckedUnanswered) {
          this.hasCheckedUnanswered = true;
          void this.replyToUnansweredChats();
        }
      }
    });

    this.sock.ev.on('contacts.upsert', (contacts) => {
      contacts.forEach((c) => this.cacheContact(c));
    });
    this.sock.ev.on('contacts.update', (updates) => {
      updates.forEach((c) => this.cacheContact(c));
    });

    this.sock.ev.on('call', (calls) => {
      for (const call of calls) {
        void this.handleCall(call);
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      const ownJid = this.sock?.user?.id
        ? jidNormalizedUser(this.sock.user.id)
        : undefined;

      for (const msg of messages) {
        // Abaikan pesan dari diri sendiri
        if (msg.key.fromMe) continue;

        // Hanya proses private chat — abaikan grup, broadcast list/status, dan channel/newsletter
        const remoteJid = msg.key.remoteJid ?? '';
        if (
          remoteJid.endsWith('@g.us') ||
          remoteJid.endsWith('@broadcast') ||
          remoteJid.endsWith('@newsletter')
        ) {
          continue;
        }

        // Self-chat / linked-device sync events use the bot's own JID as remoteJid —
        // not a real conversation, so skip before touching the whitelist at all.
        if (ownJid && jidNormalizedUser(remoteJid) === ownJid) continue;

        const imageMsg = msg.message?.imageMessage;
        const stickerMsg = msg.message?.stickerMessage;
        const text =
          msg.message?.conversation ??
          msg.message?.extendedTextMessage?.text ??
          (stickerMsg ? '[Stiker]' : '');

        // Protocol/system messages (history sync, receipts, reactions, ...) carry no
        // text, image, or sticker — nothing to reply to, so skip before the whitelist check.
        if (!imageMsg && !stickerMsg && !text) continue;

        const phoneNumber = await this.resolvePhoneNumber(msg, remoteJid);

        if (msg.pushName) {
          this.contactNames.set(phoneNumber, msg.pushName);
        }

        // Admin membalas (quote-reply) sebuah notifikasi forward — relay langsung ke
        // nomor aslinya, tanpa masuk ke AI sama sekali.
        if (
          this.whitelistService.isAdmin(phoneNumber) &&
          (await this.tryRelayAdminReply(msg, phoneNumber))
        ) {
          continue;
        }

        // Nomor tidak ada di whitelist — abaikan sepenuhnya, tidak ada balasan
        // ke pengirim, tapi teruskan isi pesannya ke admin untuk ditinjau.
        if (!(await this.whitelistService.isAllowed(phoneNumber))) {
          this.logger.warn(
            `Nomor ${phoneNumber} tidak ada di whitelist, pesan diabaikan.`,
          );
          await this.forwardToAdmins(phoneNumber, msg, text);
          continue;
        }

        // Pesan teks biasa ditunda dulu (debounce) supaya beberapa pesan beruntun
        // digabung jadi satu obrolan, bukan dibalas satu-satu.
        if (!stickerMsg && !imageMsg) {
          this.queueTextMessage(
            phoneNumber,
            remoteJid,
            text,
            this.isStaleMessage(msg),
          );
          continue;
        }

        try {
          let replies: string[];

          if (stickerMsg) {
            // Tidak bisa "membaca" stiker — minta pengirim pakai teks saja.
            replies = [STICKER_FALLBACK_TEXT];
          } else if (imageMsg) {
            const rawMime = imageMsg.mimetype ?? 'image/jpeg';
            const mimeType = (
              SUPPORTED_MIMES.has(rawMime) ? rawMime : 'image/jpeg'
            ) as SupportedImageMime;
            const buffer = await downloadMediaMessage(msg, 'buffer', {});
            const caption = imageMsg.caption ?? '';
            replies = await this.messageService.handleImage(
              phoneNumber,
              buffer,
              mimeType,
              caption,
            );
          } else {
            // Sudah difilter di atas (bukan sticker/image berarti masuk batch teks).
            continue;
          }

          if (
            this.isStaleMessage(msg) &&
            !this.apologizedThisSession.has(phoneNumber)
          ) {
            this.apologizedThisSession.add(phoneNumber);
            replies = [this.pickApology(), ...replies];
          }

          await this.sendBubbles(remoteJid, replies);
        } catch (err) {
          this.logger.error(`Error memproses pesan dari ${phoneNumber}:`, err);
          try {
            await this.sock?.sendMessage(remoteJid, {
              text: '⚠️ Maaf, terjadi kesalahan saat memproses pesanmu. Coba lagi nanti ya!',
            });
          } catch {
            // Jika kirim error message pun gagal, cukup log saja
          }
        }
      }
    });
  }

  /**
   * WhatsApp sometimes addresses a contact by an opaque "@lid" identifier instead of
   * their real "@s.whatsapp.net" phone-number JID (a privacy feature). Whitelist and
   * conversation lookups are keyed by phone number, so resolve it before using it.
   */
  private async resolvePhoneNumber(
    msg: WAMessage,
    remoteJid: string,
  ): Promise<string> {
    if (!LID_JID_RE.test(remoteJid)) {
      return remoteJid.replace('@s.whatsapp.net', '');
    }

    const altJid = msg.key.remoteJidAlt;
    if (altJid) {
      return altJid.replace('@s.whatsapp.net', '');
    }

    const pnJid =
      await this.sock?.signalRepository.lidMapping.getPNForLID(remoteJid);
    if (pnJid) {
      return pnJid.replace('@s.whatsapp.net', '');
    }

    this.logger.warn(`Tidak bisa resolve nomor asli untuk LID ${remoteJid}`);
    return remoteJid;
  }

  /** Caches a contact's display name (keyed by bare phone number) for later lookups. */
  private cacheContact(contact: Partial<Contact>): void {
    const name = contact.name ?? contact.notify;
    const jid = contact.phoneNumber ?? contact.id;
    if (!name || !jid) return;

    const number = jidNormalizedUser(jid).replace('@s.whatsapp.net', '');
    if (!LID_JID_RE.test(number)) {
      this.contactNames.set(number, name);
    }
  }

  /** True if this message's own timestamp is old enough to have arrived while offline. */
  private isStaleMessage(msg: WAMessage): boolean {
    const timestampSec = toNumber(msg.messageTimestamp);
    if (!timestampSec) return false;
    return Date.now() - timestampSec * 1000 > OFFLINE_APOLOGY_THRESHOLD_MS;
  }

  private pickApology(): string {
    const index = Math.floor(Math.random() * OFFLINE_APOLOGY_LINES.length);
    return OFFLINE_APOLOGY_LINES[index];
  }

  /** Buffers a text message and (re)starts the debounce timer for that number. */
  private queueTextMessage(
    phoneNumber: string,
    remoteJid: string,
    text: string,
    isStale: boolean,
  ): void {
    const existing = this.textBatches.get(phoneNumber);

    if (existing) {
      clearTimeout(existing.timer);
      existing.parts.push(text);
      existing.hasStale = existing.hasStale || isStale;
      existing.timer = setTimeout(
        () => void this.flushTextBatch(phoneNumber),
        TEXT_BATCH_DEBOUNCE_MS,
      );
      return;
    }

    this.textBatches.set(phoneNumber, {
      parts: [text],
      remoteJid,
      hasStale: isStale,
      timer: setTimeout(
        () => void this.flushTextBatch(phoneNumber),
        TEXT_BATCH_DEBOUNCE_MS,
      ),
    });
  }

  /** Fires once a number has been quiet for the debounce window — replies once, for all of it. */
  private async flushTextBatch(phoneNumber: string): Promise<void> {
    const batch = this.textBatches.get(phoneNumber);
    if (!batch) return;
    this.textBatches.delete(phoneNumber);

    const combinedText = batch.parts.join('\n');

    try {
      let replies = await this.messageService.handle(phoneNumber, combinedText);

      if (batch.hasStale && !this.apologizedThisSession.has(phoneNumber)) {
        this.apologizedThisSession.add(phoneNumber);
        replies = [this.pickApology(), ...replies];
      }

      await this.sendBubbles(batch.remoteJid, replies);
    } catch (err) {
      this.logger.error(`Error memproses pesan dari ${phoneNumber}:`, err);
      try {
        await this.sock?.sendMessage(batch.remoteJid, {
          text: '⚠️ Maaf, terjadi kesalahan saat memproses pesanmu. Coba lagi nanti ya!',
        });
      } catch {
        // Jika kirim error message pun gagal, cukup log saja
      }
    }
  }

  /** Real contact name if known, admin-set whitelist label otherwise, or just the number. */
  private async displayName(phoneNumber: string): Promise<string> {
    const name =
      this.contactNames.get(phoneNumber) ??
      (await this.whitelistService.getLabel(phoneNumber));
    return name ? `${name} (${phoneNumber})` : phoneNumber;
  }

  /**
   * Non-whitelisted senders get no reply — their message is saved as "pending" (so it
   * can be replayed once an admin approves them) and forwarded to admins to review.
   */
  private async forwardToAdmins(
    phoneNumber: string,
    msg: WAMessage,
    text: string,
  ): Promise<void> {
    const imageMsg = msg.message?.imageMessage;
    let buffer: Buffer | undefined;

    if (imageMsg) {
      try {
        buffer = await downloadMediaMessage(msg, 'buffer', {});
      } catch (err) {
        this.logger.error(`Gagal mengunduh gambar dari ${phoneNumber}:`, err);
      }
    }

    try {
      if (imageMsg && buffer) {
        const rawMime = imageMsg.mimetype ?? 'image/jpeg';
        const mimeType = SUPPORTED_MIMES.has(rawMime) ? rawMime : 'image/jpeg';
        await this.pendingMessageService.saveImage(
          phoneNumber,
          buffer,
          mimeType,
          imageMsg.caption ?? '',
        );
      } else {
        await this.pendingMessageService.saveText(phoneNumber, text);
      }
    } catch (err) {
      this.logger.error(
        `Gagal menyimpan pesan pending dari ${phoneNumber}:`,
        err,
      );
    }

    if (!this.sock) return;

    const admins = this.whitelistService.getAdminNumbers();
    if (admins.length === 0) return;

    const sender = msg.pushName
      ? `${phoneNumber} (${msg.pushName})`
      : phoneNumber;
    const header = `📩 Pesan dari nomor belum dikenal: ${sender}`;
    const hint =
      '\n\n_Balas pesan ini untuk membalas langsung ke nomor tersebut._';

    for (const admin of admins) {
      const adminJid = `${admin}@s.whatsapp.net`;
      try {
        let sent: WAMessage | undefined;
        if (imageMsg && buffer) {
          const caption = imageMsg.caption ? `\n\n${imageMsg.caption}` : '';
          sent = await this.sock.sendMessage(adminJid, {
            image: buffer,
            caption: `${header}${caption}${hint}`,
          });
        } else {
          sent = await this.sock.sendMessage(adminJid, {
            text: `${header}\n\n${text}${hint}`,
          });
        }
        if (sent?.key.id) {
          this.trackForward(sent.key.id, phoneNumber);
        }
      } catch (err) {
        this.logger.error(`Gagal meneruskan pesan ke admin ${admin}:`, err);
      }
    }
  }

  /** Remembers which forwarded notification belongs to which sender, capped in size. */
  private trackForward(messageId: string, phoneNumber: string): void {
    this.forwardedMessages.set(messageId, phoneNumber);
    if (this.forwardedMessages.size > MAX_TRACKED_FORWARDS) {
      // Map preserves insertion order — the first key is the oldest entry.
      for (const oldest of this.forwardedMessages.keys()) {
        this.forwardedMessages.delete(oldest);
        break;
      }
    }
  }

  /** The message id an incoming message is quote-replying to, if any. */
  private getQuotedStanzaId(msg: WAMessage): string | undefined {
    return (
      msg.message?.extendedTextMessage?.contextInfo?.stanzaId ??
      msg.message?.imageMessage?.contextInfo?.stanzaId ??
      undefined
    );
  }

  /**
   * If an admin quote-replied to one of our "unknown number" forwards, relay their
   * reply straight to that number and let the admin know it went through.
   * Returns true if the message was handled this way (caller should skip it otherwise).
   */
  private async tryRelayAdminReply(
    msg: WAMessage,
    adminNumber: string,
  ): Promise<boolean> {
    const stanzaId = this.getQuotedStanzaId(msg);
    if (!stanzaId) return false;

    const targetNumber = this.forwardedMessages.get(stanzaId);
    if (!targetNumber) return false;

    const targetJid = `${targetNumber}@s.whatsapp.net`;
    const adminJid = `${adminNumber}@s.whatsapp.net`;
    const imageMsg = msg.message?.imageMessage;
    const text =
      msg.message?.extendedTextMessage?.text ?? msg.message?.conversation ?? '';

    try {
      if (imageMsg) {
        const buffer = await downloadMediaMessage(msg, 'buffer', {});
        await this.sock?.sendMessage(targetJid, {
          image: buffer,
          caption: imageMsg.caption || text || undefined,
        });
      } else {
        await this.sock?.sendMessage(targetJid, { text });
      }
      await this.sock?.sendMessage(adminJid, {
        text: `✅ Balasan terkirim ke ${targetNumber}.`,
      });
    } catch (err) {
      this.logger.error(
        `Gagal meneruskan balasan admin ke ${targetNumber}:`,
        err,
      );
      try {
        await this.sock?.sendMessage(adminJid, {
          text: `⚠️ Gagal mengirim balasan ke ${targetNumber}.`,
        });
      } catch {
        // Jika notifikasi gagal pun gagal terkirim, cukup log saja
      }
    }

    return true;
  }

  /** A number just got whitelisted — replay their pending message and send the real reply. */
  private async handleApproval(phoneNumber: string): Promise<void> {
    const pending = await this.pendingMessageService.take(phoneNumber);
    if (!pending) return;

    const jid = `${phoneNumber}@s.whatsapp.net`;

    try {
      let replies: string[];

      if (pending.mediaPath && pending.mimeType) {
        const buffer = await this.pendingMessageService.loadMedia(
          pending.mediaPath,
        );
        if (buffer) {
          replies = await this.messageService.handleImage(
            phoneNumber,
            buffer,
            pending.mimeType as SupportedImageMime,
            pending.text || undefined,
          );
        } else {
          replies = await this.messageService.handle(phoneNumber, pending.text);
        }
      } else {
        replies = await this.messageService.handle(phoneNumber, pending.text);
      }

      await this.sendBubbles(jid, replies);
    } catch (err) {
      this.logger.error(
        `Gagal memproses pesan pending untuk ${phoneNumber}:`,
        err,
      );
    }
  }

  /**
   * Runs once, right after the first successful connect: finds chats where we owe
   * a reply (last stored message is still from the user — crash, restart, bug, ...)
   * and answers each one.
   */
  private async replyToUnansweredChats(): Promise<void> {
    let results: Awaited<ReturnType<MessageService['replyToUnansweredChats']>>;
    try {
      results = await this.messageService.replyToUnansweredChats();
    } catch (err) {
      this.logger.error('Gagal memeriksa chat yang belum dibalas:', err);
      return;
    }

    if (results.length === 0) return;

    this.logger.log(
      `Membalas ${results.length} chat yang tertunda dari sebelumnya...`,
    );

    for (const { phoneNumber, replies } of results) {
      const jid = `${phoneNumber}@s.whatsapp.net`;
      try {
        await this.sendBubbles(jid, replies);
      } catch (err) {
        this.logger.error(
          `Gagal mengirim balasan tertunda ke ${phoneNumber}:`,
          err,
        );
      }
      await this.delay(STARTUP_CATCHUP_DELAY_MS);
    }
  }

  /** The bot can't answer calls — reject immediately and let admins know who called. */
  private async handleCall(call: WACallEvent): Promise<void> {
    if (call.status !== 'offer') return;

    const phoneNumber = (call.callerPn ?? call.from)
      .replace('@s.whatsapp.net', '')
      .replace(LID_JID_RE, '');

    const label = await this.displayName(phoneNumber);

    this.logger.warn(`📞 Panggilan masuk dari ${label}, otomatis ditolak.`);

    try {
      await this.sock?.rejectCall(call.id, call.from);
    } catch (err) {
      this.logger.error(`Gagal menolak panggilan dari ${phoneNumber}:`, err);
    }

    const admins = this.whitelistService.getAdminNumbers();
    const kind = call.isVideo ? 'video' : 'suara';

    for (const admin of admins) {
      try {
        await this.sock?.sendMessage(`${admin}@s.whatsapp.net`, {
          text: `📞 Panggilan ${kind} masuk dari ${label}, jika nomor ini penting segera hubungi kembali.`,
        });
      } catch (err) {
        this.logger.error(`Gagal notifikasi panggilan ke admin ${admin}:`, err);
      }
    }
  }

  async sendBubbles(jid: string, bubbles: string[]): Promise<void> {
    if (!this.sock) return;

    for (let i = 0; i < bubbles.length; i++) {
      await this.sock.sendMessage(jid, { text: bubbles[i] });
      if (i < bubbles.length - 1) {
        await this.delay(BUBBLE_DELAY_MS);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
