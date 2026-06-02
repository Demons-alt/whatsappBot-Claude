import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationEntity } from './entities/conversation.entity';
import { MessageEntity, MessageRole } from './entities/message.entity';

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(ConversationEntity)
    private readonly convRepo: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private readonly msgRepo: Repository<MessageEntity>,
  ) {}

  async getOrCreate(phoneNumber: string): Promise<ConversationEntity> {
    let conv = await this.convRepo.findOne({ where: { phoneNumber } });
    if (!conv) {
      conv = this.convRepo.create({ phoneNumber });
      conv = await this.convRepo.save(conv);
    }
    return conv;
  }

  async getMessages(conversationId: string, limit = 20): Promise<MessageEntity[]> {
    // DESC + take → ambil N pesan terbaru, lalu reverse agar urutan tetap kronologis
    const msgs = await this.msgRepo.find({
      where: { conversation: { id: conversationId } },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return msgs.reverse();
  }

  async addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
  ): Promise<MessageEntity> {
    const msg = this.msgRepo.create({
      conversation: { id: conversationId } as ConversationEntity,
      role,
      content,
    });
    return this.msgRepo.save(msg);
  }

  async resetConversation(phoneNumber: string): Promise<void> {
    const conv = await this.convRepo.findOne({ where: { phoneNumber } });
    if (conv) {
      await this.msgRepo.delete({ conversation: { id: conv.id } });
    }
  }
}
