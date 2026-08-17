import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * The most recent message a non-whitelisted number sent while waiting for admin
 * approval. Only one row is kept per phone number — once an admin approves them
 * (or a newer message arrives), it's replayed through the AI and consumed.
 */
@Entity('pending_messages')
export class PendingMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'phone_number', unique: true })
  phoneNumber: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ name: 'media_path', type: 'varchar', nullable: true })
  mediaPath: string | null;

  @Column({ name: 'mime_type', type: 'varchar', nullable: true })
  mimeType: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
