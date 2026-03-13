import { injectable } from 'inversify';
import { TriggerDirection } from '../../domain/trigger/trigger-rule.entity';

export type TriggerWizardMode = 'CREATE' | 'EDIT';

export type TriggerWizardStep =
  | 'NAME'
  | 'DIRECTION'
  | 'PERCENT'
  | 'WINDOW'
  | 'COOLDOWN'
  | 'MIN_VOLUME'
  | 'MIN_DELTA'
  | 'MIN_PRICE'
  | 'CONFIRM';

export type TriggerWizardDraft = {
  ruleId?: string;
  name?: string;
  oiDirection?: TriggerDirection;
  oiGrowthPercent?: number;
  oiGrowthMaxWindowMinutes?: number;
  cooldownMinutes?: number;
  minVolumeRatio?: number | null;
  minDeltaRatio?: number | null;
  minPriceChangePercent?: number | null;
};

export type TriggerWizardSession = {
  mode: TriggerWizardMode;
  step: TriggerWizardStep;
  draft: TriggerWizardDraft;
};

@injectable()
export class TelegramTriggerSessionStore {
  private readonly sessions = new Map<string, TriggerWizardSession>();

  public get(chatId: string): TriggerWizardSession | null {
    return this.sessions.get(chatId) ?? null;
  }

  public set(chatId: string, session: TriggerWizardSession): void {
    this.sessions.set(chatId, session);
  }

  public clear(chatId: string): void {
    this.sessions.delete(chatId);
  }
}

