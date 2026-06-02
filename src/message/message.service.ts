import { Injectable, Logger } from '@nestjs/common';
import { AIService } from '../ai/ai.service';
import { CommandHandler } from './command.handler';

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    private readonly aiService: AIService,
    private readonly commandHandler: CommandHandler,
  ) {}

  async handle(phoneNumber: string, text: string): Promise<string[]> {
    const trimmed = text.trim();
    this.logger.log(`Pesan dari ${phoneNumber}: ${trimmed}`);

    if (trimmed.startsWith('/')) {
      return this.commandHandler.handle(phoneNumber, trimmed);
    }

    return this.aiService.chat(phoneNumber, trimmed);
  }

  async handleImage(
    phoneNumber: string,
    buffer: Buffer,
    mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
    caption?: string,
  ): Promise<string[]> {
    this.logger.log(`Foto dari ${phoneNumber}${caption ? `: ${caption}` : ''}`);
    return this.aiService.chatWithImage(phoneNumber, buffer, mimeType, caption);
  }
}
