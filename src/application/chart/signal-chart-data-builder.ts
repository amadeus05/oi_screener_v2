import { injectable } from 'inversify';
import { SymbolMarketDataSnapshot } from '../market/market-data-buffer';
import { TriggerDirection } from '../../domain/trigger/trigger-rule.entity';
import { ExchangeId } from '../../domain/market/exchange-market-data-provider.interface';
import { SignalChartRenderInput } from './signal-chart-renderer';

@injectable()
export class SignalChartDataBuilder {
  public build(
    snapshot: SymbolMarketDataSnapshot,
    signalNumber: number,
    exchangeId: ExchangeId,
    direction: TriggerDirection,
  ): SignalChartRenderInput {
    return {
      exchange: this.formatExchange(exchangeId),
      symbol: snapshot.symbol,
      direction: direction === TriggerDirection.DOWN ? 'SHORT' : 'LONG',
      signalNumber,
      candles: snapshot.candles.slice(-60),
      openInterestPoints: snapshot.openInterestPoints.slice(-60),
      minuteTradeDeltas: snapshot.minuteTradeDeltas.slice(-60),
    };
  }

  private formatExchange(exchangeId: ExchangeId): string {
    switch (exchangeId) {
      case ExchangeId.BINANCE:
        return 'Binance';
      case ExchangeId.BYBIT:
        return 'Bybit';
      case ExchangeId.OKX:
        return 'OKX';
      default:
        return exchangeId;
    }
  }
}
