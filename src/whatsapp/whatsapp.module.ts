import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { MessageModule } from '../message/message.module';

@Module({
  imports: [MessageModule],
  providers: [WhatsappService],
})
export class WhatsappModule {}
