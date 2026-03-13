import { inject, injectable } from 'inversify';
import { AppConfig } from '../../config/app.config';
import {
  ExchangeId,
  ExchangeMarketDataProvider,
  MarketCandle,
  MarketSubscription,
  MarketTrade,
  OpenInterestPoint,
} from '../../domain/market/exchange-market-data-provider.interface';
import { TYPES } from '../../di/types';
import { BinanceOpenInterestPoller } from './binance-open-interest-poller';
import { BinanceService } from './binance.service';
import {
  BinanceAggTradeStreamEvent,
  BinanceKlineStreamEvent,
} from './binance-websocket.types';
import { BinanceWebSocketManager } from './binance-websocket-manager';
import { BinanceMapper } from './binance.mapper';

@injectable()
export class BinanceAdapter implements ExchangeMarketDataProvider {
  public constructor(
    @inject(TYPES.AppConfig)
    private readonly config: AppConfig,
    @inject(TYPES.BinanceService)
    private readonly service: BinanceService,
    @inject(TYPES.BinanceMapper)
    private readonly mapper: BinanceMapper,
    @inject(TYPES.BinanceWebSocketManager)
    private readonly webSocketManager: BinanceWebSocketManager,
    @inject(TYPES.BinanceOpenInterestPoller)
    private readonly openInterestPoller: BinanceOpenInterestPoller,
  ) {}

  public getExchangeId(): ExchangeId {
    return ExchangeId.BINANCE;
  }

  public async getSupportedSymbols(): Promise<string[]> {
    const response = await this.service.getUsdMExchangeInfo();
    const blacklist = new Set(
      this.config.symbolBlacklist.map((symbol) => symbol.toUpperCase()),
    );

    return response.symbols
      .filter(
        (item) =>
          item.contractType === 'PERPETUAL' &&
          item.status === 'TRADING' &&
          item.quoteAsset === this.config.quoteAsset,
      )
      .map((item) => item.symbol)
      .filter((symbol) => !blacklist.has(symbol.toUpperCase()));
  }

  public async subscribeTo1mCandles(
    symbols: string[],
    onCandle: (candle: MarketCandle) => Promise<void> | void,
  ): Promise<MarketSubscription> {
    const streams = symbols.map((symbol) => `${symbol.toLowerCase()}@kline_1m`);

    return this.webSocketManager.subscribe<BinanceKlineStreamEvent>(
      streams,
      async (payload) => {
        if (!payload.k.x) {
          return;
        }

        await onCandle(
          this.mapper.toMarketCandle(
            [
              payload.k.t,
              payload.k.o,
              payload.k.h,
              payload.k.l,
              payload.k.c,
              payload.k.v,
              payload.k.T,
              '0',
              0,
              '0',
              '0',
              '0',
            ],
            payload.s,
          ),
        );
      },
    );
  }

  public async startOpenInterestPolling(
    symbols: string[],
    onOpenInterestPoint: (point: OpenInterestPoint) => Promise<void> | void,
  ): Promise<MarketSubscription> {
    return this.openInterestPoller.start(symbols, onOpenInterestPoint);
  }

  public async subscribeToTrades(
    symbols: string[],
    onTrade: (trade: MarketTrade) => Promise<void> | void,
  ): Promise<MarketSubscription> {
    const streams = symbols.map((symbol) => `${symbol.toLowerCase()}@aggTrade`);

    return this.webSocketManager.subscribe<BinanceAggTradeStreamEvent>(
      streams,
      async (payload) => {
        await onTrade({
          tradeId: String(payload.a),
          symbol: payload.s,
          timestamp: new Date(payload.T),
          price: Number(payload.p),
          quantity: Number(payload.q),
          isBuyerMaker: payload.m,
        });
      },
    );
  }
}
