import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIService } from './ai.service';
import { WeatherTool } from './tools/weather.tool';
import { DateTimeTool } from './tools/datetime.tool';
import { CurrencyTool } from './tools/currency.tool';
import { PrayerTool } from './tools/prayer.tool';
import { HolidayTool } from './tools/holiday.tool';
import { ConversationModule } from '../conversation/conversation.module';
import { LLM_PROVIDER } from './providers/llm-provider.interface';
import { AnthropicProvider } from './providers/anthropic.provider';
import { HermesProvider } from './providers/hermes.provider';

@Module({
  imports: [ConversationModule],
  providers: [
    AIService,
    WeatherTool,
    DateTimeTool,
    CurrencyTool,
    PrayerTool,
    HolidayTool,
    AnthropicProvider,
    HermesProvider,
    {
      provide: LLM_PROVIDER,
      useFactory: (
        config: ConfigService,
        anthropic: AnthropicProvider,
        hermes: HermesProvider,
      ) =>
        config.get<string>('ai.provider') === 'hermes' ? hermes : anthropic,
      inject: [ConfigService, AnthropicProvider, HermesProvider],
    },
  ],
  exports: [AIService],
})
export class AIModule {}
