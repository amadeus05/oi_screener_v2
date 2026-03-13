import { inject, injectable } from 'inversify';
import { AppConfig } from '../../config/app.config';
import { PumpScreenerRuntimeConfig } from '../../config/pump-screener.config';
import {
  ExchangeId,
  ExchangeMarketDataProvider,
  MarketCandle,
  MarketSubscription,
  MarketTrade,
  OpenInterestPoint,
} from '../../domain/market/exchange-market-data-provider.interface';
import { TYPES } from '../../di/types';
import { BybitMapper } from './bybit.mapper';
import { BybitService } from './bybit.service';
import {
  BybitKlineMessage,
  BybitTickerData,
  BybitTickerMessage,
  BybitTradeMessage,
} from './bybit-websocket.types';
import {
  BybitMessageEnvelope,
  BybitWebSocketManager,
} from './bybit-websocket-manager';

@injectable()
export class BybitAdapter implements ExchangeMarketDataProvider {
  public constructor(
    @inject(TYPES.AppConfig)
    private readonly config: AppConfig,
    @inject(TYPES.PumpScreenerRuntimeConfig)
    private readonly runtimeConfig: PumpScreenerRuntimeConfig,
    @inject(TYPES.BybitService)
    private readonly service: BybitService,
    @inject(TYPES.BybitMapper)
    private readonly mapper: BybitMapper,
    @inject(TYPES.BybitWebSocketManager)
    private readonly webSocketManager: BybitWebSocketManager,
  ) {}

  public getExchangeId(): ExchangeId {
    return ExchangeId.BYBIT;
  }

  public async getSupportedSymbols(): Promise<string[]> {
    const instruments = await this.service.getLinearInstruments();
    const blacklist = new Set(
      this.config.symbolBlacklist.map((symbol) => symbol.toUpperCase()),
    );

    return instruments
      .filter(
        (item) =>
          item.status === 'Trading' &&
          item.quoteCoin === this.config.quoteAsset &&
          item.contractType.toLowerCase().includes('perpetual'),
      )
      .map((item) => item.symbol)
      .filter((symbol) => !blacklist.has(symbol.toUpperCase()));
  }

  public async subscribeTo1mCandles(
    symbols: string[],
    onCandle: (candle: MarketCandle) => Promise<void> | void,
  ): Promise<MarketSubscription> {
    const topics = symbols.map((symbol) => `kline.1.${symbol}`);

    return this.webSocketManager.subscribe<BybitMessageEnvelope<BybitKlineMessage['data']>>(
      topics,
      async (payload) => {
        const symbol = payload.topic?.split('.').at(-1);

        if (!symbol || !payload.data) {
          return;
        }

        for (const item of payload.data) {
          if (!item.confirm) {
            continue;
          }

          await onCandle(this.mapper.toMarketCandle(item, symbol));
        }
      },
    );
  }

  public async startOpenInterestPolling(
    symbols: string[],
    onOpenInterestPoint: (point: OpenInterestPoint) => Promise<void> | void,
  ): Promise<MarketSubscription> {
    const topics = symbols.map((symbol) => `tickers.${symbol}`);
    const latestPoints = new Map<string, OpenInterestPoint>();
    const stream = await this.webSocketManager.subscribe<BybitMessageEnvelope<BybitTickerMessage['data']>>(
      topics,
      async (payload) => {
        if (!payload.data) {
          return;
        }

        const items = Array.isArray(payload.data) ? payload.data : [payload.data];

        for (const item of items) {
          if (!item.symbol) {
            continue;
          }

          const point = this.mapper.toOpenInterestPoint(
            item.symbol,
            item as BybitTickerData,
            payload.ts ?? Date.now(),
          );

          if (point) {
            latestPoints.set(point.symbol, point);
          }
        }
      },
    );

    const timer = setInterval(() => {
      void Promise.all(
        Array.from(latestPoints.values()).map((point) => onOpenInterestPoint({
          ...point,
          timestamp: new Date(),
        })),
      );
    }, this.runtimeConfig.oiPollIntervalMs);

    return {
      close: async () => {
        clearInterval(timer);
        await stream.close();
      },
    };
  }

  public async subscribeToTrades(
    symbols: string[],
    onTrade: (trade: MarketTrade) => Promise<void> | void,
  ): Promise<MarketSubscription> {
    const topics = symbols.map((symbol) => `publicTrade.${symbol}`);

    return this.webSocketManager.subscribe<BybitMessageEnvelope<BybitTradeMessage['data']>>(
      topics,
      async (payload) => {
        if (!payload.data) {
          return;
        }

        for (const item of payload.data) {
          await onTrade(this.mapper.toMarketTrade(item));
        }
      },
    );
  }
}
