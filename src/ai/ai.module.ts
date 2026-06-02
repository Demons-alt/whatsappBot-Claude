import { Module } from '@nestjs/common';
import { AIService } from './ai.service';
import { WeatherTool } from './tools/weather.tool';
import { DateTimeTool } from './tools/datetime.tool';
import { CurrencyTool } from './tools/currency.tool';
import { PrayerTool } from './tools/prayer.tool';
import { HolidayTool } from './tools/holiday.tool';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [ConversationModule],
  providers: [AIService, WeatherTool, DateTimeTool, CurrencyTool, PrayerTool, HolidayTool],
  exports: [AIService],
})
export class AIModule {}
