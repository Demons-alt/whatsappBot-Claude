import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationModule } from '../conversation/conversation.module';
import { WhitelistEntity } from './entities/whitelist.entity';
import { PendingMessageEntity } from './entities/pending-message.entity';
import { WhitelistService } from './whitelist.service';
import { PendingMessageService } from './pending-message.service';
import { WhitelistEventBus } from './whitelist-events';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhitelistEntity, PendingMessageEntity]),
    ConversationModule,
  ],
  providers: [WhitelistService, PendingMessageService, WhitelistEventBus],
  exports: [WhitelistService, PendingMessageService, WhitelistEventBus],
})
export class WhitelistModule {}
