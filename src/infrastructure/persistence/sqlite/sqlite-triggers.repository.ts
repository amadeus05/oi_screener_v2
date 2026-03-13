import { injectable } from 'inversify';
import {
  TriggerDirection,
  TriggerRule,
  TriggerRuleStatus,
} from '../../../domain/trigger/trigger-rule.entity';
import { TriggersRepository } from '../../../domain/trigger/triggers.repository';
import { SqliteConnection } from './sqlite-connection';

type TriggerRuleRow = {
  id: string;
  name: string;
  oi_direction: TriggerDirection;
  oi_growth_percent: number;
  oi_growth_max_window_minutes: number;
  cooldown_minutes: number;
  min_volume_ratio: number | null;
  min_delta_ratio: number | null;
  min_price_change_percent: number | null;
  status: TriggerRuleStatus;
  created_at: string;
  updated_at: string;
};

@injectable()
export class SqliteTriggersRepository implements TriggersRepository {
  public constructor(private readonly connection: SqliteConnection) {
    this.createTable();
  }

  public async findAll(): Promise<TriggerRule[]> {
    const rows = this.connection.all<TriggerRuleRow>(
      `
        SELECT
          id,
          name,
          oi_direction,
          oi_growth_percent,
          oi_growth_max_window_minutes,
          cooldown_minutes,
          min_volume_ratio,
          min_delta_ratio,
          min_price_change_percent,
          status,
          created_at,
          updated_at
        FROM trigger_rules
        ORDER BY created_at ASC
      `,
    );

    return rows.map((row) => this.mapRowToEntity(row));
  }

  public async findActive(): Promise<TriggerRule[]> {
    const rows = this.connection.all<TriggerRuleRow>(
      `
        SELECT
          id,
          name,
          oi_direction,
          oi_growth_percent,
          oi_growth_max_window_minutes,
          cooldown_minutes,
          min_volume_ratio,
          min_delta_ratio,
          min_price_change_percent,
          status,
          created_at,
          updated_at
        FROM trigger_rules
        WHERE status = @status
        ORDER BY created_at ASC
      `,
      {
        status: TriggerRuleStatus.ACTIVE,
      },
    );

    return rows.map((row) => this.mapRowToEntity(row));
  }

  public async findById(id: string): Promise<TriggerRule | null> {
    const row = this.connection.get<TriggerRuleRow>(
      `
        SELECT
          id,
          name,
          oi_direction,
          oi_growth_percent,
          oi_growth_max_window_minutes,
          cooldown_minutes,
          min_volume_ratio,
          min_delta_ratio,
          min_price_change_percent,
          status,
          created_at,
          updated_at
        FROM trigger_rules
        WHERE id = @id
      `,
      { id },
    );

    return row ? this.mapRowToEntity(row) : null;
  }

  public async save(rule: TriggerRule): Promise<void> {
    this.connection.run(
      `
        INSERT INTO trigger_rules (
          id,
          name,
          oi_direction,
          oi_growth_percent,
          oi_growth_max_window_minutes,
          cooldown_minutes,
          min_volume_ratio,
          min_delta_ratio,
          min_price_change_percent,
          status,
          created_at,
          updated_at
        ) VALUES (
          @id,
          @name,
          @oiDirection,
          @oiGrowthPercent,
          @oiGrowthMaxWindowMinutes,
          @cooldownMinutes,
          @minVolumeRatio,
          @minDeltaRatio,
          @minPriceChangePercent,
          @status,
          @createdAt,
          @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          oi_direction = excluded.oi_direction,
          oi_growth_percent = excluded.oi_growth_percent,
          oi_growth_max_window_minutes = excluded.oi_growth_max_window_minutes,
          cooldown_minutes = excluded.cooldown_minutes,
          min_volume_ratio = excluded.min_volume_ratio,
          min_delta_ratio = excluded.min_delta_ratio,
          min_price_change_percent = excluded.min_price_change_percent,
          status = excluded.status,
          updated_at = excluded.updated_at
      `,
      {
        id: rule.id,
        name: rule.name,
        oiDirection: rule.oiDirection,
        oiGrowthPercent: rule.oiGrowthPercent,
        oiGrowthMaxWindowMinutes: rule.oiGrowthMaxWindowMinutes,
        cooldownMinutes: rule.cooldownMinutes,
        minVolumeRatio: rule.minVolumeRatio ?? null,
        minDeltaRatio: rule.minDeltaRatio ?? null,
        minPriceChangePercent: rule.minPriceChangePercent ?? null,
        status: rule.status,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      },
    );
  }

  public async updateStatus(id: string, isActive: boolean): Promise<void> {
    this.connection.run(
      `
        UPDATE trigger_rules
        SET
          status = @status,
          updated_at = @updatedAt
        WHERE id = @id
      `,
      {
        id,
        status: isActive ? TriggerRuleStatus.ACTIVE : TriggerRuleStatus.DISABLED,
        updatedAt: new Date().toISOString(),
      },
    );
  }

  public async deleteById(id: string): Promise<void> {
    this.connection.run(
      `
        DELETE FROM trigger_rules
        WHERE id = @id
      `,
      { id },
    );
  }

  private createTable(): void {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS trigger_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        oi_direction TEXT NOT NULL,
        oi_growth_percent REAL NOT NULL,
        oi_growth_max_window_minutes INTEGER NOT NULL,
        cooldown_minutes INTEGER NOT NULL,
        min_volume_ratio REAL NULL,
        min_delta_ratio REAL NULL,
        min_price_change_percent REAL NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  private mapRowToEntity(row: TriggerRuleRow): TriggerRule {
    return {
      id: row.id,
      name: row.name,
      oiDirection: row.oi_direction,
      oiGrowthPercent: row.oi_growth_percent,
      oiGrowthMaxWindowMinutes: row.oi_growth_max_window_minutes,
      cooldownMinutes: row.cooldown_minutes,
      minVolumeRatio: row.min_volume_ratio,
      minDeltaRatio: row.min_delta_ratio,
      minPriceChangePercent: row.min_price_change_percent,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
