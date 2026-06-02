import { Module } from '@nestjs/common';
import { MessageService } from './message.service';
import { CommandHandler } from './command.handler';
import { AIModule } from '../ai/ai.module';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [AIModule, ConversationModule],
  providers: [MessageService, CommandHandler],
  exports: [MessageService],
})
export class MessageModule {}
