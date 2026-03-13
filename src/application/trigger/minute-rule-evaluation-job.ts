import { injectable } from 'inversify';
import crypto from 'node:crypto';
import { MarketDataBuffer } from '../market/market-data-buffer';
import { Signal } from '../../domain/signal/signal.entity';
import { SignalsRepository } from '../../domain/signal/signals.repository';
import { TriggerRuleEvaluator, TriggerEvaluationStatus } from './trigger-rule-evaluator';
import { TriggersRepository } from '../../domain/trigger/triggers.repository';

@injectable()
export class MinuteRuleEvaluationJob {
  public constructor(
    private readonly triggersRepository: TriggersRepository,
    private readonly signalsRepository: SignalsRepository,
    private readonly marketDataBuffer: MarketDataBuffer,
    private readonly triggerRuleEvaluator: TriggerRuleEvaluator,
  ) {}

  public async run(
    symbols: string[],
    evaluationMinuteClose: Date = new Date(),
  ): Promise<Signal[]> {
    const rules = await this.triggersRepository.findActive();
    const createdSignals: Signal[] = [];
    const now = evaluationMinuteClose;

    for (const rule of rules) {
      for (const symbol of symbols) {
        const snapshot = this.marketDataBuffer.getSnapshot(symbol, now);
        const result = this.triggerRuleEvaluator.evaluate(rule, snapshot);

        if (result.status !== TriggerEvaluationStatus.MATCHED) {
          continue;
        }

        const lastSignal = await this.signalsRepository.findLastByRuleAndSymbol(
          rule.id,
          symbol,
        );

        if (
          lastSignal &&
          now.getTime() - lastSignal.triggeredAt.getTime() <
            rule.cooldownMinutes * 60_000
        ) {
          continue;
        }

        const { dayStartUtc, dayEndUtc } = this.getUtcDayBounds(now);
        const signalCountForDay = await this.signalsRepository.countForSymbolOnDay(
          symbol,
          dayStartUtc,
          dayEndUtc,
        );

        const signal: Signal = {
          id: crypto.randomUUID(),
          ruleId: rule.id,
          symbol,
          signalNumberForDay: signalCountForDay + 1,
          triggeredAt: now,
          metadataJson: JSON.stringify({
            reason: result.reason,
            metrics: result.metrics,
            snapshot,
          }),
        };

        await this.signalsRepository.save(signal);
        createdSignals.push(signal);
      }
    }

    return createdSignals;
  }

  private getUtcDayBounds(date: Date): {
    dayStartUtc: Date;
    dayEndUtc: Date;
  } {
    const dayStartUtc = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60_000);

    return {
      dayStartUtc,
      dayEndUtc,
    };
  }
}
