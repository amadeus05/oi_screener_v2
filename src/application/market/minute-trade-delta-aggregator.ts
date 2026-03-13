import { injectable } from 'inversify';
import {
  MarketTrade,
  MinuteTradeDelta,
} from '../../domain/market/exchange-market-data-provider.interface';

type MutableMinuteTradeDelta = {
  symbol: string;
  minuteStartMs: number;
  marketBuyBaseVolume: number;
  marketSellBaseVolume: number;
  marketBuyNotional: number;
  marketSellNotional: number;
};

@injectable()
export class MinuteTradeDeltaAggregator {
  private readonly bucketsBySymbol = new Map<string, Map<number, MutableMinuteTradeDelta>>();
  private readonly processedTradeIdsBySymbol = new Map<string, Set<string>>();

  public appendTrade(trade: MarketTrade): MinuteTradeDelta | null {
    const processedTradeIds = this.getOrCreateProcessedTradeIds(trade.symbol);

    if (processedTradeIds.has(trade.tradeId)) {
      return null;
    }

    processedTradeIds.add(trade.tradeId);

    const minuteStartMs = this.toMinuteStart(trade.timestamp);
    const symbolBuckets = this.getOrCreateSymbolBuckets(trade.symbol);
    const bucket = symbolBuckets.get(minuteStartMs) ?? this.createBucket(trade.symbol, minuteStartMs);
    const notional = trade.price * trade.quantity;

    if (trade.isBuyerMaker) {
      bucket.marketSellBaseVolume += trade.quantity;
      bucket.marketSellNotional += notional;
    } else {
      bucket.marketBuyBaseVolume += trade.quantity;
      bucket.marketBuyNotional += notional;
    }

    symbolBuckets.set(minuteStartMs, bucket);

    return this.toMinuteTradeDelta(bucket);
  }

  public getDeltas(symbol: string): MinuteTradeDelta[] {
    const symbolBuckets = this.bucketsBySymbol.get(symbol);

    if (!symbolBuckets) {
      return [];
    }

    return [...symbolBuckets.values()]
      .sort((left, right) => left.minuteStartMs - right.minuteStartMs)
      .map((bucket) => this.toMinuteTradeDelta(bucket));
  }

  public trim(symbol: string, minTimestamp: number): void {
    const symbolBuckets = this.bucketsBySymbol.get(symbol);
    const processedTradeIds = this.processedTradeIdsBySymbol.get(symbol);

    if (!symbolBuckets) {
      return;
    }

    for (const minuteStartMs of symbolBuckets.keys()) {
      if (minuteStartMs < minTimestamp) {
        symbolBuckets.delete(minuteStartMs);
      }
    }

    if (processedTradeIds && symbolBuckets.size === 0) {
      processedTradeIds.clear();
    }
  }

  private getOrCreateSymbolBuckets(symbol: string): Map<number, MutableMinuteTradeDelta> {
    const existing = this.bucketsBySymbol.get(symbol);

    if (existing) {
      return existing;
    }

    const created = new Map<number, MutableMinuteTradeDelta>();
    this.bucketsBySymbol.set(symbol, created);
    return created;
  }

  private getOrCreateProcessedTradeIds(symbol: string): Set<string> {
    const existing = this.processedTradeIdsBySymbol.get(symbol);

    if (existing) {
      return existing;
    }

    const created = new Set<string>();
    this.processedTradeIdsBySymbol.set(symbol, created);
    return created;
  }

  private createBucket(symbol: string, minuteStartMs: number): MutableMinuteTradeDelta {
    return {
      symbol,
      minuteStartMs,
      marketBuyBaseVolume: 0,
      marketSellBaseVolume: 0,
      marketBuyNotional: 0,
      marketSellNotional: 0,
    };
  }

  private toMinuteTradeDelta(bucket: MutableMinuteTradeDelta): MinuteTradeDelta {
    const totalTakerNotional = bucket.marketBuyNotional + bucket.marketSellNotional;
    const deltaNotional = bucket.marketBuyNotional - bucket.marketSellNotional;

    return {
      symbol: bucket.symbol,
      minuteStart: new Date(bucket.minuteStartMs),
      minuteClose: new Date(bucket.minuteStartMs + 60_000),
      marketBuyBaseVolume: bucket.marketBuyBaseVolume,
      marketSellBaseVolume: bucket.marketSellBaseVolume,
      marketBuyNotional: bucket.marketBuyNotional,
      marketSellNotional: bucket.marketSellNotional,
      deltaNotional,
      deltaRatio: totalTakerNotional > 0 ? deltaNotional / totalTakerNotional : 0,
    };
  }

  private toMinuteStart(timestamp: Date): number {
    const time = timestamp.getTime();
    return time - (time % 60_000);
  }
}
