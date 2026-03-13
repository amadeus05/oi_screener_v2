import { TelegramSubscriber } from './telegram-subscriber.entity';

export interface TelegramSubscribersRepository {
  exists(chatId: string): Promise<boolean>;
  findAll(): Promise<TelegramSubscriber[]>;
  save(chatId: string): Promise<void>;
}
