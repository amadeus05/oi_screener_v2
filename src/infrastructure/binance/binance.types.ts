export type BinanceFuturesExchangeInfoResponse = {
  symbols: Array<{
    symbol: string;
    contractType: string;
    status: string;
    quoteAsset: string;
  }>;
};

export type BinanceFuturesKlineResponse = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

export type BinanceOpenInterestHistResponseItem = {
  symbol: string;
  sumOpenInterest: string;
  sumOpenInterestValue: string;
  timestamp: number;
};

export type BinanceCurrentOpenInterestResponse = {
  openInterest: string;
  symbol: string;
  time: number;
};

export type BinanceTakerBuySellVolumeResponseItem = {
  buySellRatio: string;
  buyVol: string;
  sellVol: string;
  timestamp: number;
};
