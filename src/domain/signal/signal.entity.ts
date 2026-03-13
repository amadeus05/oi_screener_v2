export type Signal = {
  id: string;
  ruleId: string;
  symbol: string;
  signalNumberForDay: number;
  triggeredAt: Date;
  metadataJson: string | null;
};

