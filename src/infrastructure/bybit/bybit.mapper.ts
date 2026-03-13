import { injectable } from 'inversify';
import {
  MarketCandle,
  MarketTrade,
  OpenInterestPoint,
} from '../../domain/market/exchange-market-data-provider.interface';
import {
  BybitKlineMessage,
  BybitTickerData,
  BybitTradeMessage,
} from './bybit-websocket.types';

@injectable()
export class BybitMapper {
  public toMarketCandle(
    payload: BybitKlineMessage['data'][number],
    symbol: string,
  ): MarketCandle {
    return {
      symbol,
      openTime: new Date(payload.start),
      closeTime: new Date(payload.end),
      open: Number(payload.open),
      high: Number(payload.high),
      low: Number(payload.low),
      close: Number(payload.close),
      volume: Number(payload.volume),
    };
  }

  public toMarketTrade(
    payload: BybitTradeMessage['data'][number],
  ): MarketTrade {
    return {
      tradeId: payload.i,
      symbol: payload.s,
      timestamp: new Date(payload.T),
      price: Number(payload.p),
      quantity: Number(payload.v),
      isBuyerMaker: payload.S === 'Sell',
    };
  }

  public toOpenInterestPoint(
    symbol: string,
    payload: BybitTickerData,
    timestamp: number,
  ): OpenInterestPoint | null {
    if (payload.openInterest === undefined) {
      return null;
    }

    return {
      symbol,
      timestamp: new Date(timestamp),
      openInterest: Number(payload.openInterest),
    };
  }
}

