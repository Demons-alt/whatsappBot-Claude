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
import { ChatCombosProvider } from './providers/chat-combos.provider';

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
    ChatCombosProvider,
    {
      provide: LLM_PROVIDER,
      useFactory: (
        config: ConfigService,
        anthropic: AnthropicProvider,
        chatCombos: ChatCombosProvider,
      ) =>
        config.get<string>('ai.provider') === 'chat-combos'
          ? chatCombos
          : anthropic,
      inject: [ConfigService, AnthropicProvider, ChatCombosProvider],
    },
  ],
  exports: [AIService],
})
export class AIModule {}
