import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhitelistEntity } from './entities/whitelist.entity';

@Injectable()
export class WhitelistService {
  constructor(
    @InjectRepository(WhitelistEntity)
    private readonly repo: Repository<WhitelistEntity>,
    private readonly config: ConfigService,
  ) {}

  /** Admin numbers come from env (ADMIN_NUMBERS) — they bypass the DB whitelist entirely,
   *  which is what lets them bootstrap and manage the whitelist via chat commands. */
  private get adminNumbers(): Set<string> {
    const raw = this.config.get<string>('whitelist.adminNumbers') ?? '';
    return new Set(
      raw
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean),
    );
  }

  isAdmin(phoneNumber: string): boolean {
    return this.adminNumbers.has(phoneNumber);
  }

  async isAllowed(phoneNumber: string): Promise<boolean> {
    if (this.isAdmin(phoneNumber)) return true;
    const found = await this.repo.findOne({ where: { phoneNumber } });
    return !!found;
  }

  async add(phoneNumber: string, label?: string): Promise<boolean> {
    const existing = await this.repo.findOne({ where: { phoneNumber } });
    if (existing) return false;
    await this.repo.save(this.repo.create({ phoneNumber, label: label ?? null }));
    return true;
  }

  async remove(phoneNumber: string): Promise<boolean> {
    const result = await this.repo.delete({ phoneNumber });
    return (result.affected ?? 0) > 0;
  }

  list(): Promise<WhitelistEntity[]> {
    return this.repo.find({ order: { createdAt: 'ASC' } });
  }
}
