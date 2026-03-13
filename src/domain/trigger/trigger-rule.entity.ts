export enum TriggerDirection {
  UP = 'UP',
  DOWN = 'DOWN',
}

export enum TriggerRuleStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

export type TriggerRule = {
  id: string;
  name: string;
  oiDirection: TriggerDirection;
  oiGrowthPercent: number;
  oiGrowthMaxWindowMinutes: number;
  cooldownMinutes: number;
  minVolumeRatio?: number | null;
  minDeltaRatio?: number | null;
  minPriceChangePercent?: number | null;
  status: TriggerRuleStatus;
  createdAt: Date;
  updatedAt: Date;
};
