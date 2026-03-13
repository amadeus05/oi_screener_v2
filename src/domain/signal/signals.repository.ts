import { Signal } from './signal.entity';

export interface SignalsRepository {
  findLastByRuleAndSymbol(ruleId: string, symbol: string): Promise<Signal | null>;
  countForSymbolOnDay(symbol: string, dayStartUtc: Date, dayEndUtc: Date): Promise<number>;
  countAllOnDay(dayStartUtc: Date, dayEndUtc: Date): Promise<number>;
  findRecent(limit: number): Promise<Signal[]>;
  save(signal: Signal): Promise<void>;
}
