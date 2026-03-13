import { injectable } from 'inversify';
import { Signal } from '../../../domain/signal/signal.entity';
import { SignalsRepository } from '../../../domain/signal/signals.repository';
import { SqliteConnection } from './sqlite-connection';

type SignalRow = {
  id: string;
  rule_id: string;
  symbol: string;
  signal_number_for_day: number;
  triggered_at: string;
  metadata_json: string | null;
};

@injectable()
export class SqliteSignalsRepository implements SignalsRepository {
  public constructor(private readonly connection: SqliteConnection) {
    this.createTable();
  }

  public async findLastByRuleAndSymbol(
    ruleId: string,
    symbol: string,
  ): Promise<Signal | null> {
    const row = this.connection.get<SignalRow>(
      `
        SELECT
          id,
          rule_id,
          symbol,
          signal_number_for_day,
          triggered_at,
          metadata_json
        FROM signals
        WHERE rule_id = @ruleId
          AND symbol = @symbol
        ORDER BY triggered_at DESC
        LIMIT 1
      `,
      { ruleId, symbol },
    );

    return row ? this.mapRowToEntity(row) : null;
  }

  public async countForSymbolOnDay(
    symbol: string,
    dayStartUtc: Date,
    dayEndUtc: Date,
  ): Promise<number> {
    const row = this.connection.get<{ total: number }>(
      `
        SELECT COUNT(*) as total
        FROM signals
        WHERE symbol = @symbol
          AND triggered_at >= @dayStartUtc
          AND triggered_at < @dayEndUtc
      `,
      {
        symbol,
        dayStartUtc: dayStartUtc.toISOString(),
        dayEndUtc: dayEndUtc.toISOString(),
      },
    );

    return row?.total ?? 0;
  }

  public async countAllOnDay(
    dayStartUtc: Date,
    dayEndUtc: Date,
  ): Promise<number> {
    const row = this.connection.get<{ total: number }>(
      `
        SELECT COUNT(*) as total
        FROM signals
        WHERE triggered_at >= @dayStartUtc
          AND triggered_at < @dayEndUtc
      `,
      {
        dayStartUtc: dayStartUtc.toISOString(),
        dayEndUtc: dayEndUtc.toISOString(),
      },
    );

    return row?.total ?? 0;
  }

  public async findRecent(limit: number): Promise<Signal[]> {
    const rows = this.connection.all<SignalRow>(
      `
        SELECT
          id,
          rule_id,
          symbol,
          signal_number_for_day,
          triggered_at,
          metadata_json
        FROM signals
        ORDER BY triggered_at DESC
        LIMIT @limit
      `,
      { limit },
    );

    return rows.map((row) => this.mapRowToEntity(row));
  }

  public async save(signal: Signal): Promise<void> {
    this.connection.run(
      `
        INSERT INTO signals (
          id,
          rule_id,
          symbol,
          signal_number_for_day,
          triggered_at,
          metadata_json
        ) VALUES (
          @id,
          @ruleId,
          @symbol,
          @signalNumberForDay,
          @triggeredAt,
          @metadataJson
        )
      `,
      {
        id: signal.id,
        ruleId: signal.ruleId,
        symbol: signal.symbol,
        signalNumberForDay: signal.signalNumberForDay,
        triggeredAt: signal.triggeredAt.toISOString(),
        metadataJson: signal.metadataJson,
      },
    );
  }

  private createTable(): void {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS signals (
        id TEXT PRIMARY KEY,
        rule_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        signal_number_for_day INTEGER NOT NULL,
        triggered_at TEXT NOT NULL,
        metadata_json TEXT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_signals_rule_symbol_triggered_at
      ON signals(rule_id, symbol, triggered_at DESC);

      CREATE INDEX IF NOT EXISTS idx_signals_symbol_triggered_at
      ON signals(symbol, triggered_at);
    `);
  }

  private mapRowToEntity(row: SignalRow): Signal {
    return {
      id: row.id,
      ruleId: row.rule_id,
      symbol: row.symbol,
      signalNumberForDay: row.signal_number_for_day,
      triggeredAt: new Date(row.triggered_at),
      metadataJson: row.metadata_json,
    };
  }
}
