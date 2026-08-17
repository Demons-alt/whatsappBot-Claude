import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('whitelist_numbers')
export class WhitelistEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'phone_number', unique: true })
  phoneNumber: string;

  @Column({ type: 'varchar', nullable: true })
  label: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
