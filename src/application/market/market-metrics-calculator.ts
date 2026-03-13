import { injectable } from 'inversify';
import { SymbolMarketDataSnapshot } from './market-data-buffer';

export type OiGrowthWindowMatch = {
  from: Date;
  to: Date;
  growthPercent: number;
};

export type SymbolMarketMetrics = {
  symbol: string;
  latestDeltaRatio: number | null;
  latestDeltaNotional: number | null;
  currentVolume: number | null;
  averageVolume: number | null;
  volumeRatio: number | null;
  priceChangePercent: number | null;
  oiGrowthPercent: number | null;
  bestOiGrowthWindow: OiGrowthWindowMatch | null;
  oiDropPercent: number | null;
  bestOiDropWindow: OiGrowthWindowMatch | null;
};

@injectable()
export class MarketMetricsCalculator {
  public calculate(
    snapshot: SymbolMarketDataSnapshot,
    ruleWindowMinutes: number,
  ): SymbolMarketMetrics {
    const latestDelta = this.getLatestDelta(snapshot);
    const volumeMetrics = this.getVolumeMetrics(snapshot, ruleWindowMinutes);
    const priceChangePercent = this.getPriceChangePercent(snapshot, ruleWindowMinutes);
    const oiGrowth = this.findBestOiGrowthWindow(snapshot, ruleWindowMinutes);
    const oiDrop = this.findBestOiDropWindow(snapshot, ruleWindowMinutes);

    return {
      symbol: snapshot.symbol,
      latestDeltaRatio: latestDelta?.deltaRatio ?? null,
      latestDeltaNotional: latestDelta?.deltaNotional ?? null,
      currentVolume: volumeMetrics.currentVolume,
      averageVolume: volumeMetrics.averageVolume,
      volumeRatio: volumeMetrics.volumeRatio,
      priceChangePercent,
      oiGrowthPercent: oiGrowth?.growthPercent ?? null,
      bestOiGrowthWindow: oiGrowth,
      oiDropPercent: oiDrop?.growthPercent ?? null,
      bestOiDropWindow: oiDrop,
    };
  }

  private getLatestDelta(snapshot: SymbolMarketDataSnapshot) {
    const closedDeltas = this.getClosedMinuteTradeDeltas(snapshot);

    if (closedDeltas.length === 0) {
      return null;
    }

    return closedDeltas[closedDeltas.length - 1];
  }

  private getVolumeMetrics(
    snapshot: SymbolMarketDataSnapshot,
    ruleWindowMinutes: number,
  ): {
    currentVolume: number | null;
    averageVolume: number | null;
    volumeRatio: number | null;
  } {
    const candles = snapshot.candles;

    if (candles.length === 0) {
      return {
        currentVolume: null,
        averageVolume: null,
        volumeRatio: null,
      };
    }

    const currentVolume = candles[candles.length - 1].volume;
    const baselineCandles = candles.slice(
      Math.max(0, candles.length - 1 - Math.max(1, ruleWindowMinutes)),
      candles.length - 1,
    );
    const averageVolume =
      baselineCandles.length > 0
        ? baselineCandles.reduce((sum, candle) => sum + candle.volume, 0) /
          baselineCandles.length
        : null;

    return {
      currentVolume,
      averageVolume,
      volumeRatio:
        averageVolume && averageVolume > 0 ? currentVolume / averageVolume : null,
    };
  }

  private getPriceChangePercent(
    snapshot: SymbolMarketDataSnapshot,
    ruleWindowMinutes: number,
  ): number | null {
    const candles = snapshot.candles.slice(-Math.max(1, ruleWindowMinutes));

    if (candles.length < 2) {
      return null;
    }

    const startPrice = candles[0].open;
    const endPrice = candles[candles.length - 1].close;

    if (startPrice <= 0) {
      return null;
    }

    return ((endPrice - startPrice) / startPrice) * 100;
  }

  private findBestOiGrowthWindow(
    snapshot: SymbolMarketDataSnapshot,
    ruleWindowMinutes: number,
  ): OiGrowthWindowMatch | null {
    return this.findBestOiMoveWindow(snapshot, ruleWindowMinutes, 'UP');
  }

  private findBestOiDropWindow(
    snapshot: SymbolMarketDataSnapshot,
    ruleWindowMinutes: number,
  ): OiGrowthWindowMatch | null {
    return this.findBestOiMoveWindow(snapshot, ruleWindowMinutes, 'DOWN');
  }

  private findBestOiMoveWindow(
    snapshot: SymbolMarketDataSnapshot,
    ruleWindowMinutes: number,
    direction: 'UP' | 'DOWN',
  ): OiGrowthWindowMatch | null {
    const points = snapshot.openInterestPoints;

    if (points.length < 2) {
      return null;
    }

    const maxWindowMs = Math.max(1, ruleWindowMinutes) * 60_000;
    let bestMatch: OiGrowthWindowMatch | null = null;

    for (let endIndex = 1; endIndex < points.length; endIndex += 1) {
      const endPoint = points[endIndex];

      for (let startIndex = endIndex - 1; startIndex >= 0; startIndex -= 1) {
        const startPoint = points[startIndex];
        const elapsedMs =
          endPoint.timestamp.getTime() - startPoint.timestamp.getTime();

        if (elapsedMs > maxWindowMs) {
          break;
        }

        if (startPoint.openInterest <= 0) {
          continue;
        }

        const rawChangePercent =
          ((endPoint.openInterest - startPoint.openInterest) /
            startPoint.openInterest) *
          100;

        const directionalPercent =
          direction === 'UP' ? rawChangePercent : rawChangePercent * -1;

        if (directionalPercent < 0) {
          continue;
        }

        if (!bestMatch || directionalPercent > bestMatch.growthPercent) {
          bestMatch = {
            from: startPoint.timestamp,
            to: endPoint.timestamp,
            growthPercent: directionalPercent,
          };
        }
      }
    }

    return bestMatch;
  }

  private getClosedMinuteTradeDeltas(snapshot: SymbolMarketDataSnapshot) {
    const now = Date.now();

    return snapshot.minuteTradeDeltas.filter(
      (delta) => delta.minuteClose.getTime() <= now,
    );
  }
}
