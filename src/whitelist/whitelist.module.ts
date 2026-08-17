import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhitelistEntity } from './entities/whitelist.entity';
import { WhitelistService } from './whitelist.service';

@Module({
  imports: [TypeOrmModule.forFeature([WhitelistEntity])],
  providers: [WhitelistService],
  exports: [WhitelistService],
})
export class WhitelistModule {}
