import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaStorage } from '../conversation/media.storage';
import { PendingMessageEntity } from './entities/pending-message.entity';

const PENDING_MEDIA_DIR = 'pending';

@Injectable()
export class PendingMessageService {
  constructor(
    @InjectRepository(PendingMessageEntity)
    private readonly repo: Repository<PendingMessageEntity>,
    private readonly mediaStorage: MediaStorage,
  ) {}

  async saveText(phoneNumber: string, text: string): Promise<void> {
    await this.replace(phoneNumber, text, null, null);
  }

  async saveImage(
    phoneNumber: string,
    buffer: Buffer,
    mimeType: string,
    caption: string,
  ): Promise<void> {
    const mediaPath = await this.mediaStorage.save(
      PENDING_MEDIA_DIR,
      phoneNumber,
      buffer,
      mimeType,
    );
    await this.replace(phoneNumber, caption, mediaPath, mimeType);
  }

  loadMedia(mediaPath: string): Promise<Buffer | null> {
    return this.mediaStorage.read(mediaPath);
  }

  /** Fetches and consumes the pending message for a number, if any. */
  async take(phoneNumber: string): Promise<PendingMessageEntity | null> {
    const found = await this.repo.findOne({ where: { phoneNumber } });
    if (!found) return null;
    await this.repo.delete({ phoneNumber });
    return found;
  }

  private async replace(
    phoneNumber: string,
    text: string,
    mediaPath: string | null,
    mimeType: string | null,
  ): Promise<void> {
    // Only the latest message per number matters — drop any older one.
    await this.repo.delete({ phoneNumber });
    await this.repo.save(
      this.repo.create({ phoneNumber, text, mediaPath, mimeType }),
    );
  }
}
