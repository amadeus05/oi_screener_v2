import { injectable } from 'inversify';
import { SymbolMarketDataSnapshot } from '../market/market-data-buffer';
import {
  MarketMetricsCalculator,
  SymbolMarketMetrics,
} from '../market/market-metrics-calculator';
import {
  TriggerDirection,
  TriggerRule,
} from '../../domain/trigger/trigger-rule.entity';

export enum TriggerEvaluationStatus {
  MATCHED = 'MATCHED',
  NOT_MATCHED = 'NOT_MATCHED',
  NOT_READY = 'NOT_READY',
}

export type TriggerEvaluationResult = {
  status: TriggerEvaluationStatus;
  metrics: SymbolMarketMetrics;
  reason: string;
};

@injectable()
export class TriggerRuleEvaluator {
  public constructor(
    private readonly marketMetricsCalculator: MarketMetricsCalculator = new MarketMetricsCalculator(),
  ) {}

  public evaluate(
    rule: TriggerRule,
    snapshot: SymbolMarketDataSnapshot,
  ): TriggerEvaluationResult {
    const metrics = this.marketMetricsCalculator.calculate(
      snapshot,
      rule.oiGrowthMaxWindowMinutes,
    );

    if (!this.isReadyForRule(snapshot, rule)) {
      return {
        status: TriggerEvaluationStatus.NOT_READY,
        metrics,
        reason: 'Not enough data for this rule window yet.',
      };
    }

    const oiPercent =
      rule.oiDirection === TriggerDirection.UP
        ? metrics.oiGrowthPercent
        : metrics.oiDropPercent;

    if (oiPercent === null || oiPercent < rule.oiGrowthPercent) {
      return {
        status: TriggerEvaluationStatus.NOT_MATCHED,
        metrics,
        reason: 'OI threshold is not met.',
      };
    }

    if (
      rule.minVolumeRatio !== null &&
      rule.minVolumeRatio !== undefined &&
      (metrics.volumeRatio === null || metrics.volumeRatio < rule.minVolumeRatio)
    ) {
      return {
        status: TriggerEvaluationStatus.NOT_MATCHED,
        metrics,
        reason: 'Volume ratio threshold is not met.',
      };
    }

    if (
      rule.minDeltaRatio !== null &&
      rule.minDeltaRatio !== undefined &&
      !this.isDirectionalThresholdMet(
        metrics.latestDeltaRatio,
        rule.minDeltaRatio,
        rule.oiDirection,
      )
    ) {
      return {
        status: TriggerEvaluationStatus.NOT_MATCHED,
        metrics,
        reason: 'Delta ratio threshold is not met.',
      };
    }

    if (
      rule.minPriceChangePercent !== null &&
      rule.minPriceChangePercent !== undefined &&
      !this.isDirectionalThresholdMet(
        metrics.priceChangePercent,
        rule.minPriceChangePercent,
        rule.oiDirection,
      )
    ) {
      return {
        status: TriggerEvaluationStatus.NOT_MATCHED,
        metrics,
        reason: 'Price change threshold is not met.',
      };
    }

    return {
      status: TriggerEvaluationStatus.MATCHED,
      metrics,
      reason: 'All thresholds are met.',
    };
  }

  private isReadyForRule(
    snapshot: SymbolMarketDataSnapshot,
    rule: TriggerRule,
  ): boolean {
    const requiredCandles = Math.max(2, rule.oiGrowthMaxWindowMinutes);
    const requiredClosedMinuteDeltas = Math.max(1, rule.oiGrowthMaxWindowMinutes);
    const requiredOiPoints = 2;
    const now = Date.now();
    const closedMinuteDeltas = snapshot.minuteTradeDeltas.filter(
      (delta) => delta.minuteClose.getTime() <= now,
    );
    const eligibleOiPoints = snapshot.openInterestPoints.filter((point) => {
      const distanceMs =
        now - point.timestamp.getTime();
      return distanceMs <= rule.oiGrowthMaxWindowMinutes * 60_000;
    });

    return (
      snapshot.candles.length >= requiredCandles &&
      closedMinuteDeltas.length >= requiredClosedMinuteDeltas &&
      eligibleOiPoints.length >= requiredOiPoints
    );
  }

  private isDirectionalThresholdMet(
    actualValue: number | null,
    threshold: number,
    direction: TriggerDirection,
  ): boolean {
    if (actualValue === null) {
      return false;
    }

    if (direction === TriggerDirection.DOWN) {
      return actualValue <= threshold * -1;
    }

    return actualValue >= threshold;
  }
}
