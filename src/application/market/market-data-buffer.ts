import { injectable } from 'inversify';
import {
  MarketCandle,
  MarketTrade,
  MinuteTradeDelta,
  OpenInterestPoint,
} from '../../domain/market/exchange-market-data-provider.interface';
import { PumpScreenerRuntimeConfig } from '../../config/pump-screener.config';
import { MinuteTradeDeltaAggregator } from './minute-trade-delta-aggregator';

export type SymbolMarketDataSnapshot = {
  symbol: string;
  candles: MarketCandle[];
  trades: MarketTrade[];
  minuteTradeDeltas: MinuteTradeDelta[];
  openInterestPoints: OpenInterestPoint[];
  warmupProgress: number;
};

@injectable()
export class MarketDataBuffer {
  private readonly candlesBySymbol = new Map<string, MarketCandle[]>();
  private readonly tradesBySymbol = new Map<string, MarketTrade[]>();
  private readonly openInterestBySymbol = new Map<string, OpenInterestPoint[]>();
  private readonly firstSeenAtBySymbol = new Map<string, number>();

  public constructor(
    private readonly minuteTradeDeltaAggregator: MinuteTradeDeltaAggregator = new MinuteTradeDeltaAggregator(),
    private readonly config: PumpScreenerRuntimeConfig = {
      aggregationWindowMinutes: 60,
      maxRuleWindowMinutes: 30,
      warmupMinutes: 60,
      evaluationGracePeriodMs: 5_000,
      oiPollIntervalMs: 60_000,
      oiMaxRequestsPerSecond: 15,
    },
  ) {}

  public appendCandle(candle: MarketCandle): void {
    this.touchSymbol(candle.symbol, candle.closeTime.getTime());
    const items = this.getOrCreate(this.candlesBySymbol, candle.symbol);
    items.push(candle);
    this.trimCandles(candle.symbol, candle.closeTime.getTime());
  }

  public appendTrade(trade: MarketTrade): void {
    this.touchSymbol(trade.symbol, trade.timestamp.getTime());
    const items = this.getOrCreate(this.tradesBySymbol, trade.symbol);
    const delta = this.minuteTradeDeltaAggregator.appendTrade(trade);

    if (delta === null) {
      return;
    }

    items.push(trade);
    this.trimTrades(trade.symbol, trade.timestamp.getTime());
  }

  public appendOpenInterest(point: OpenInterestPoint): void {
    this.touchSymbol(point.symbol, point.timestamp.getTime());
    const items = this.getOrCreate(this.openInterestBySymbol, point.symbol);
    this.upsertOpenInterestPoint(items, point);
    this.trimOpenInterest(point.symbol, point.timestamp.getTime());
  }

  public getSnapshot(symbol: string, now: Date = new Date()): SymbolMarketDataSnapshot {
    const nowTimestamp = now.getTime();
    this.trimCandles(symbol, nowTimestamp);
    this.trimTrades(symbol, nowTimestamp);
    this.trimOpenInterest(symbol, nowTimestamp);

    return {
      symbol,
      candles: [...(this.candlesBySymbol.get(symbol) ?? [])],
      trades: [...(this.tradesBySymbol.get(symbol) ?? [])],
      minuteTradeDeltas: this.minuteTradeDeltaAggregator.getDeltas(symbol),
      openInterestPoints: [...(this.openInterestBySymbol.get(symbol) ?? [])],
      warmupProgress: this.getWarmupProgress(symbol, now),
    };
  }

  public getWarmupProgress(symbol: string, now: Date = new Date()): number {
    const firstSeenAt = this.firstSeenAtBySymbol.get(symbol);

    if (!firstSeenAt) {
      return 0;
    }

    const elapsedMs = Math.max(0, now.getTime() - firstSeenAt);
    const warmupMs = this.config.warmupMinutes * 60_000;

    if (warmupMs <= 0) {
      return 1;
    }

    return Math.min(1, elapsedMs / warmupMs);
  }

  private getOrCreate<T>(storage: Map<string, T[]>, symbol: string): T[] {
    const existing = storage.get(symbol);

    if (existing) {
      return existing;
    }

    const created: T[] = [];
    storage.set(symbol, created);
    return created;
  }

  private touchSymbol(symbol: string, timestamp: number): void {
    const firstSeenAt = this.firstSeenAtBySymbol.get(symbol);

    if (!firstSeenAt || timestamp < firstSeenAt) {
      this.firstSeenAtBySymbol.set(symbol, timestamp);
    }
  }

  private trimCandles(symbol: string, nowTimestamp: number): void {
    const items = this.candlesBySymbol.get(symbol);

    if (!items) {
      return;
    }

    this.trimInPlace(items, nowTimestamp, (item) => item.closeTime.getTime());
  }

  private trimTrades(symbol: string, nowTimestamp: number): void {
    const items = this.tradesBySymbol.get(symbol);

    if (!items) {
      this.minuteTradeDeltaAggregator.trim(
        symbol,
        nowTimestamp - this.config.aggregationWindowMinutes * 60_000,
      );
      return;
    }

    this.trimInPlace(items, nowTimestamp, (item) => item.timestamp.getTime());
    this.minuteTradeDeltaAggregator.trim(
      symbol,
      nowTimestamp - this.config.aggregationWindowMinutes * 60_000,
    );
  }

  private trimOpenInterest(symbol: string, nowTimestamp: number): void {
    const items = this.openInterestBySymbol.get(symbol);

    if (!items) {
      return;
    }

    this.trimInPlace(items, nowTimestamp, (item) => item.timestamp.getTime());
  }

  private trimInPlace<T>(
    items: T[],
    nowTimestamp: number,
    getTimestamp: (item: T) => number,
  ): void {
    const minTimestamp =
      nowTimestamp - this.config.aggregationWindowMinutes * 60_000;

    let firstValidIndex = 0;

    while (
      firstValidIndex < items.length &&
      getTimestamp(items[firstValidIndex]) < minTimestamp
    ) {
      firstValidIndex += 1;
    }

    if (firstValidIndex > 0) {
      items.splice(0, firstValidIndex);
    }
  }

  private upsertOpenInterestPoint(
    items: OpenInterestPoint[],
    point: OpenInterestPoint,
  ): void {
    const timestamp = point.timestamp.getTime();
    const existingIndex = items.findIndex(
      (item) => item.timestamp.getTime() === timestamp,
    );

    if (existingIndex >= 0) {
      items[existingIndex] = point;
    } else {
      items.push(point);
    }

    items.sort(
      (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
    );
  }
}
