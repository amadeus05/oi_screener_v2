import { injectable } from 'inversify';
import crypto from 'node:crypto';
import {
  TriggerDirection,
  TriggerRule,
  TriggerRuleStatus,
} from '../../domain/trigger/trigger-rule.entity';
import { TriggersRepository } from '../../domain/trigger/triggers.repository';

export type CreateTriggerRuleInput = {
  name: string;
  oiDirection: TriggerDirection;
  oiGrowthPercent: number;
  oiGrowthMaxWindowMinutes: number;
  cooldownMinutes: number;
  minVolumeRatio?: number | null;
  minDeltaRatio?: number | null;
  minPriceChangePercent?: number | null;
};

@injectable()
export class TriggerManagementService {
  public constructor(
    private readonly triggersRepository: TriggersRepository,
  ) {}

  public async create(input: CreateTriggerRuleInput): Promise<TriggerRule> {
    const now = new Date();
    const rule: TriggerRule = {
      id: crypto.randomUUID(),
      name: input.name,
      oiDirection: input.oiDirection,
      oiGrowthPercent: input.oiGrowthPercent,
      oiGrowthMaxWindowMinutes: input.oiGrowthMaxWindowMinutes,
      cooldownMinutes: input.cooldownMinutes,
      minVolumeRatio: input.minVolumeRatio ?? null,
      minDeltaRatio: input.minDeltaRatio ?? null,
      minPriceChangePercent: input.minPriceChangePercent ?? null,
      status: TriggerRuleStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
    };

    await this.triggersRepository.save(rule);
    return rule;
  }

  public async update(
    ruleId: string,
    patch: Partial<CreateTriggerRuleInput>,
  ): Promise<TriggerRule | null> {
    const existing = await this.triggersRepository.findById(ruleId);

    if (!existing) {
      return null;
    }

    const updated: TriggerRule = {
      ...existing,
      ...patch,
      updatedAt: new Date(),
    };

    await this.triggersRepository.save(updated);
    return updated;
  }

  public async delete(ruleId: string): Promise<void> {
    await this.triggersRepository.deleteById(ruleId);
  }
}

