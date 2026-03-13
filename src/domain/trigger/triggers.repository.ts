import { TriggerRule } from './trigger-rule.entity';

export interface TriggersRepository {
  findAll(): Promise<TriggerRule[]>;
  findActive(): Promise<TriggerRule[]>;
  findById(id: string): Promise<TriggerRule | null>;
  save(rule: TriggerRule): Promise<void>;
  updateStatus(id: string, isActive: boolean): Promise<void>;
  deleteById(id: string): Promise<void>;
}
