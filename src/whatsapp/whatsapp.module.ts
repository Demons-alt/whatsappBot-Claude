import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { MessageModule } from '../message/message.module';
import { WhitelistModule } from '../whitelist/whitelist.module';

@Module({
  imports: [MessageModule, WhitelistModule],
  providers: [WhatsappService],
})
export class WhatsappModule {}
