import { Injectable } from '@nestjs/common';
import { ConversationService } from '../conversation/conversation.service';

@Injectable()
export class CommandHandler {
  constructor(private readonly convService: ConversationService) {}

  async handle(phoneNumber: string, command: string): Promise<string[]> {
    const cmd = command.trim().toLowerCase().split(' ')[0];

    switch (cmd) {
      case '/reset':
        await this.convService.resetConversation(phoneNumber);
        return ['✅ Riwayat percakapan kamu sudah direset.\nKita mulai dari awal ya! 😊'];

      default:
        return [`❓ Command "${cmd}" tidak dikenali.\n\nCommand yang tersedia:\n• /reset — hapus riwayat percakapan`];
    }
  }
}
