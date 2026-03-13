import { ExchangeId } from '../domain/market/exchange-market-data-provider.interface';

export type AppConfig = {
  activeExchange: ExchangeId;
  quoteAsset: string;
  symbolBlacklist: string[];
  symbolsLimit: number | null;
};

export const appConfig: AppConfig = {
  activeExchange:
    process.env.ACTIVE_EXCHANGE === ExchangeId.BYBIT
      ? ExchangeId.BYBIT
      : process.env.ACTIVE_EXCHANGE === ExchangeId.OKX
        ? ExchangeId.OKX
        : ExchangeId.BINANCE,
  quoteAsset: 'USDT',
  symbolBlacklist: [],
  symbolsLimit:
    process.env.SYMBOLS_LIMIT && Number(process.env.SYMBOLS_LIMIT) > 0
      ? Number(process.env.SYMBOLS_LIMIT)
      : null,
};
