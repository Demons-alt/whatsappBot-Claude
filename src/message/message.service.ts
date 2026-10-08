import { Injectable, Logger } from '@nestjs/common';
import { AIService } from '../ai/ai.service';
import { CommandHandler } from './command.handler';
import { ConversationService } from '../conversation/conversation.service';
import { WhitelistService } from '../whitelist/whitelist.service';
import { BotResponse, textResponse } from './outgoing-message';

export interface UnansweredReply {
  phoneNumber: string;
  response: BotResponse;
}

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    private readonly aiService: AIService,
    private readonly commandHandler: CommandHandler,
    private readonly conversationService: ConversationService,
    private readonly whitelistService: WhitelistService,
  ) {}

  async handle(phoneNumber: string, text: string): Promise<BotResponse> {
    const trimmed = text.trim();
    this.logger.log(`Pesan dari ${phoneNumber}: ${trimmed}`);

    if (trimmed.startsWith('/')) {
      return textResponse(
        await this.commandHandler.handle(phoneNumber, trimmed),
      );
    }

    return this.aiService.chat(phoneNumber, trimmed);
  }

  async handleImage(
    phoneNumber: string,
    buffer: Buffer,
    mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
    caption?: string,
  ): Promise<BotResponse> {
    this.logger.log(`Foto dari ${phoneNumber}${caption ? `: ${caption}` : ''}`);
    return this.aiService.chatWithImage(phoneNumber, buffer, mimeType, caption);
  }

  /**
   * Startup catch-up: finds conversations that never got a reply (last stored
   * message is still from the user) and answers each one. Re-checks the whitelist
   * in case someone was removed since their last message.
   */
  async replyToUnansweredChats(): Promise<UnansweredReply[]> {
    const conversations =
      await this.conversationService.findUnansweredConversations();
    if (conversations.length === 0) return [];

    this.logger.log(
      `Ditemukan ${conversations.length} chat yang belum dibalas.`,
    );

    const results: UnansweredReply[] = [];

    for (const conv of conversations) {
      const stillAllowed = await this.whitelistService.isAllowed(
        conv.phoneNumber,
      );
      if (!stillAllowed) continue;

      try {
        const response = await this.aiService.answerPending(conv.phoneNumber);
        if (response.bubbles.length > 0 || response.images.length > 0) {
          results.push({ phoneNumber: conv.phoneNumber, response });
        }
      } catch (err) {
        this.logger.error(
          `Gagal membalas chat tertunda untuk ${conv.phoneNumber}:`,
          err,
        );
      }
    }

    return results;
  }
}
