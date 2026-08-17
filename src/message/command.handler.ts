import { Injectable } from '@nestjs/common';
import { ConversationService } from '../conversation/conversation.service';
import { WhitelistService } from '../whitelist/whitelist.service';

@Injectable()
export class CommandHandler {
  constructor(
    private readonly convService: ConversationService,
    private readonly whitelistService: WhitelistService,
  ) {}

  async handle(phoneNumber: string, command: string): Promise<string[]> {
    const cmd = command.trim().toLowerCase().split(' ')[0];

    switch (cmd) {
      case '/reset':
        await this.convService.resetConversation(phoneNumber);
        return ['✅ Riwayat percakapan kamu sudah direset.\nKita mulai dari awal ya! 😊'];

      case '/whitelist':
        if (!this.whitelistService.isAdmin(phoneNumber)) {
          return ['⛔ Command ini hanya untuk admin.'];
        }
        return this.handleWhitelistCommand(command);

      default:
        return [`❓ Command "${cmd}" tidak dikenali.\n\nCommand yang tersedia:\n• /reset — hapus riwayat percakapan`];
    }
  }

  private async handleWhitelistCommand(command: string): Promise<string[]> {
    const parts = command.trim().split(/\s+/);
    const sub = parts[1]?.toLowerCase();

    switch (sub) {
      case 'add': {
        const number = parts[2];
        if (!number) return ['Format: /whitelist add <nomor> [label]'];
        const label = parts.slice(3).join(' ') || undefined;
        const added = await this.whitelistService.add(number, label);
        return [
          added
            ? `✅ Nomor ${number} ditambahkan ke whitelist.`
            : `Nomor ${number} sudah ada di whitelist.`,
        ];
      }

      case 'remove': {
        const number = parts[2];
        if (!number) return ['Format: /whitelist remove <nomor>'];
        const removed = await this.whitelistService.remove(number);
        return [
          removed
            ? `✅ Nomor ${number} dihapus dari whitelist.`
            : `Nomor ${number} tidak ditemukan di whitelist.`,
        ];
      }

      case 'list': {
        const entries = await this.whitelistService.list();
        if (entries.length === 0) return ['Whitelist masih kosong.'];
        const lines = entries.map(
          (e) => `• ${e.phoneNumber}${e.label ? ` (${e.label})` : ''}`,
        );
        return [`📋 Whitelist (${entries.length}):\n${lines.join('\n')}`];
      }

      default:
        return [
          'Format: /whitelist add <nomor> [label] | /whitelist remove <nomor> | /whitelist list',
        ];
    }
  }
}
