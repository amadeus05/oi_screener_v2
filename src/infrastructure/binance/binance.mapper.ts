import { injectable } from 'inversify';
import {
  AggressiveTradeStats,
  MarketCandle,
  OpenInterestPoint,
} from '../../domain/market/exchange-market-data-provider.interface';
import {
  BinanceFuturesKlineResponse,
  BinanceCurrentOpenInterestResponse,
  BinanceOpenInterestHistResponseItem,
  BinanceTakerBuySellVolumeResponseItem,
} from './binance.types';

@injectable()
export class BinanceMapper {
  public toMarketCandle(kline: BinanceFuturesKlineResponse, symbol: string): MarketCandle {
    return {
      symbol,
      openTime: new Date(kline[0]),
      closeTime: new Date(kline[6]),
      open: Number(kline[1]),
      high: Number(kline[2]),
      low: Number(kline[3]),
      close: Number(kline[4]),
      volume: Number(kline[5]),
    };
  }

  public toOpenInterestPoint(
    item: BinanceOpenInterestHistResponseItem,
  ): OpenInterestPoint {
    return {
      symbol: item.symbol,
      timestamp: new Date(item.timestamp),
      openInterest: Number(item.sumOpenInterest),
    };
  }

  public toCurrentOpenInterestPoint(
    item: BinanceCurrentOpenInterestResponse,
  ): OpenInterestPoint {
    return {
      symbol: item.symbol,
      timestamp: new Date(item.time),
      openInterest: Number(item.openInterest),
    };
  }

  public toAggressiveTradeStats(
    symbol: string,
    items: BinanceTakerBuySellVolumeResponseItem[],
    from: Date,
    to: Date,
  ): AggressiveTradeStats {
    const marketBuyVolume = items.reduce((sum, item) => sum + Number(item.buyVol), 0);
    const marketSellVolume = items.reduce((sum, item) => sum + Number(item.sellVol), 0);

    return {
      symbol,
      from,
      to,
      marketBuyVolume,
      marketSellVolume,
      totalTakerVolume: marketBuyVolume + marketSellVolume,
    };
  }
}
