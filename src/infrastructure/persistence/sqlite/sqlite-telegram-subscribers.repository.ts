import { injectable } from 'inversify';
import { TelegramSubscriber } from '../../../domain/telegram/telegram-subscriber.entity';
import { TelegramSubscribersRepository } from '../../../domain/telegram/telegram-subscribers.repository';
import { SqliteConnection } from './sqlite-connection';

type TelegramSubscriberRow = {
  chat_id: string;
  created_at: string;
  updated_at: string;
};

@injectable()
export class SqliteTelegramSubscribersRepository
  implements TelegramSubscribersRepository
{
  public constructor(private readonly connection: SqliteConnection) {
    this.createTable();
  }

  public async exists(chatId: string): Promise<boolean> {
    const row = this.connection.get<{ exists_count: number }>(
      `
        SELECT COUNT(*) as exists_count
        FROM telegram_subscribers
        WHERE chat_id = @chatId
      `,
      { chatId },
    );

    return (row?.exists_count ?? 0) > 0;
  }

  public async findAll(): Promise<TelegramSubscriber[]> {
    const rows = this.connection.all<TelegramSubscriberRow>(
      `
        SELECT
          chat_id,
          created_at,
          updated_at
        FROM telegram_subscribers
        ORDER BY created_at ASC
      `,
    );

    return rows.map((row) => ({
      chatId: row.chat_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  public async save(chatId: string): Promise<void> {
    const now = new Date().toISOString();

    this.connection.run(
      `
        INSERT INTO telegram_subscribers (
          chat_id,
          created_at,
          updated_at
        ) VALUES (
          @chatId,
          @createdAt,
          @updatedAt
        )
        ON CONFLICT(chat_id) DO UPDATE SET
          updated_at = excluded.updated_at
      `,
      {
        chatId,
        createdAt: now,
        updatedAt: now,
      },
    );
  }

  private createTable(): void {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS telegram_subscribers (
        chat_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }
}
