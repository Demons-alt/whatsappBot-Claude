import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface WhitelistApprovedEvent {
  phoneNumber: string;
}

/**
 * Decouples "a number got approved" (decided in CommandHandler, message module)
 * from "reply to their pending message" (only WhatsappService can send a WhatsApp
 * reply). Both sides depend on WhitelistModule only, so no circular module imports.
 */
@Injectable()
export class WhitelistEventBus extends EventEmitter {}
