import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ConversationEntity } from './conversation.entity';

export type MessageRole = 'user' | 'assistant' | 'tool';

@Entity('messages')
export class MessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ConversationEntity, (conv) => conv.messages, {
    onDelete: 'CASCADE',
  })
  conversation: ConversationEntity;

  @Column({ type: 'varchar' })
  role: MessageRole;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'media_path', type: 'varchar', nullable: true })
  mediaPath: string | null;

  @Column({ name: 'mime_type', type: 'varchar', nullable: true })
  mimeType: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
