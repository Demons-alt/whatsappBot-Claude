import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationEntity } from './entities/conversation.entity';
import { MessageEntity, MessageRole } from './entities/message.entity';
import { MediaStorage } from './media.storage';

export type AddMessageOptions = {
  mediaPath?: string;
  mimeType?: string;
};

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(ConversationEntity)
    private readonly convRepo: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private readonly msgRepo: Repository<MessageEntity>,
    private readonly mediaStorage: MediaStorage,
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
    options?: AddMessageOptions,
  ): Promise<MessageEntity> {
    const msg = this.msgRepo.create({
      conversation: { id: conversationId } as ConversationEntity,
      role,
      content,
      mediaPath: options?.mediaPath ?? null,
      mimeType: options?.mimeType ?? null,
    });
    return this.msgRepo.save(msg);
  }

  async setMessageMedia(
    messageId: string,
    mediaPath: string,
    mimeType: string,
  ): Promise<void> {
    await this.msgRepo.update(messageId, { mediaPath, mimeType });
  }

  async saveUserImage(
    conversationId: string,
    buffer: Buffer,
    mimeType: string,
    caption?: string,
  ): Promise<MessageEntity> {
    const content = caption?.trim() || '[Foto]';
    const msg = await this.addMessage(conversationId, 'user', content);
    const mediaPath = await this.mediaStorage.save(
      conversationId,
      msg.id,
      buffer,
      mimeType,
    );
    await this.setMessageMedia(msg.id, mediaPath, mimeType);
    msg.mediaPath = mediaPath;
    msg.mimeType = mimeType;
    return msg;
  }

  loadMediaBuffer(mediaPath: string): Promise<Buffer | null> {
    return this.mediaStorage.read(mediaPath);
  }

  async resetConversation(phoneNumber: string): Promise<void> {
    const conv = await this.convRepo.findOne({ where: { phoneNumber } });
    if (conv) {
      await this.msgRepo.delete({ conversation: { id: conv.id } });
      await this.mediaStorage.deleteConversation(conv.id);
    }
  }
}
