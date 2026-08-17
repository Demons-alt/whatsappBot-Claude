import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './common/config/configuration';
import { ConversationEntity } from './conversation/entities/conversation.entity';
import { MessageEntity } from './conversation/entities/message.entity';
import { WhitelistEntity } from './whitelist/entities/whitelist.entity';
import { PendingMessageEntity } from './whitelist/entities/pending-message.entity';
import { WhatsappModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('database.host'),
        port: config.get('database.port'),
        username: config.get('database.username'),
        password: config.get('database.password'),
        database: config.get('database.database'),
        entities: [
          ConversationEntity,
          MessageEntity,
          WhitelistEntity,
          PendingMessageEntity,
        ],
        synchronize: true,
      }),
    }),
    WhatsappModule,
  ],
})
export class AppModule {}
