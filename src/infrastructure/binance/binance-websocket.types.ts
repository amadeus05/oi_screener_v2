export type BinanceCombinedStreamEnvelope<TData> = {
  stream: string;
  data: TData;
};

export type BinanceKlineStreamEvent = {
  e: 'kline';
  E: number;
  s: string;
  k: {
    t: number;
    T: number;
    s: string;
    i: string;
    o: string;
    c: string;
    h: string;
    l: string;
    v: string;
    x: boolean;
  };
};

export type BinanceAggTradeStreamEvent = {
  e: 'aggTrade';
  a: number;
  E: number;
  s: string;
  p: string;
  q: string;
  T: number;
  m: boolean;
};
