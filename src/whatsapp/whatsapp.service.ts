import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';

type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
const SUPPORTED_MIMES = new Set<string>(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
import { Boom } from '@hapi/boom';
import * as qrcode from 'qrcode-terminal';
import { MessageService } from '../message/message.service';
import { WhitelistService } from '../whitelist/whitelist.service';

const BUBBLE_DELAY_MS = 1000;

@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);
  private sock: ReturnType<typeof makeWASocket> | null = null;

  constructor(
    private readonly messageService: MessageService,
    private readonly whitelistService: WhitelistService,
  ) {}

  async onModuleInit() {
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
          (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

        this.logger.warn(`Koneksi terputus. Reconnect: ${shouldReconnect}`);
        if (shouldReconnect) {
          void this.connect();
        }
      } else if (connection === 'open') {
        this.logger.log('✅ Bot WhatsApp terhubung!');
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        // Abaikan pesan dari diri sendiri
        if (msg.key.fromMe) continue;

        // Hanya proses private chat (bukan grup)
        const remoteJid = msg.key.remoteJid ?? '';
        if (remoteJid.endsWith('@g.us')) continue;

        const text =
          msg.message?.conversation ??
          msg.message?.extendedTextMessage?.text ??
          '';

        const phoneNumber = remoteJid.replace('@s.whatsapp.net', '');

        // Nomor tidak ada di whitelist — abaikan sepenuhnya, tidak ada balasan.
        if (!(await this.whitelistService.isAllowed(phoneNumber))) {
          this.logger.warn(`Nomor ${phoneNumber} tidak ada di whitelist, pesan diabaikan.`);
          continue;
        }

        try {
          let replies: string[];

          const imageMsg = msg.message?.imageMessage;
          if (imageMsg) {
            const rawMime = imageMsg.mimetype ?? 'image/jpeg';
            const mimeType = (SUPPORTED_MIMES.has(rawMime) ? rawMime : 'image/jpeg') as SupportedImageMime;
            const buffer = (await downloadMediaMessage(msg, 'buffer', {})) as Buffer;
            const caption = imageMsg.caption ?? '';
            replies = await this.messageService.handleImage(phoneNumber, buffer, mimeType, caption);
          } else {
            if (!text) continue;
            replies = await this.messageService.handle(phoneNumber, text);
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
