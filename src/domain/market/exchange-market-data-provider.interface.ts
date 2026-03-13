export enum ExchangeId {
  BINANCE = 'BINANCE',
  BYBIT = 'BYBIT',
  OKX = 'OKX',
}

export type MarketCandle = {
  symbol: string;
  openTime: Date;
  closeTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type OpenInterestPoint = {
  symbol: string;
  timestamp: Date;
  openInterest: number;
};

export type AggressiveTradeStats = {
  symbol: string;
  from: Date;
  to: Date;
  marketBuyVolume: number;
  marketSellVolume: number;
  totalTakerVolume: number;
};

export type MarketTrade = {
  tradeId: string;
  symbol: string;
  timestamp: Date;
  price: number;
  quantity: number;
  isBuyerMaker: boolean;
};

export type MinuteTradeDelta = {
  symbol: string;
  minuteStart: Date;
  minuteClose: Date;
  marketBuyBaseVolume: number;
  marketSellBaseVolume: number;
  marketBuyNotional: number;
  marketSellNotional: number;
  deltaNotional: number;
  deltaRatio: number;
};

export type MarketSubscription = {
  close(): Promise<void>;
};

export interface ExchangeMarketDataProvider {
  getExchangeId(): ExchangeId;

  getSupportedSymbols(): Promise<string[]>;

  subscribeTo1mCandles(
    symbols: string[],
    onCandle: (candle: MarketCandle) => Promise<void> | void,
  ): Promise<MarketSubscription>;

  startOpenInterestPolling(
    symbols: string[],
    onOpenInterestPoint: (point: OpenInterestPoint) => Promise<void> | void,
  ): Promise<MarketSubscription>;

  subscribeToTrades(
    symbols: string[],
    onTrade: (trade: MarketTrade) => Promise<void> | void,
  ): Promise<MarketSubscription>;
}
