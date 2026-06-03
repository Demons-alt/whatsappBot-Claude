import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

const MEDIA_ROOT = path.join(process.cwd(), 'media');

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

@Injectable()
export class MediaStorage {
  async save(
    conversationId: string,
    messageId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const ext = MIME_TO_EXT[mimeType] ?? 'jpg';
    const relativePath = path.join(conversationId, `${messageId}.${ext}`);
    const fullPath = path.join(MEDIA_ROOT, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return relativePath;
  }

  async read(relativePath: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(path.join(MEDIA_ROOT, relativePath));
    } catch {
      return null;
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const dir = path.join(MEDIA_ROOT, conversationId);
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      // folder may not exist
    }
  }
}
