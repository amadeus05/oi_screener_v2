import { injectable } from 'inversify';
import { ExchangeId } from '../../domain/market/exchange-market-data-provider.interface';
import { Signal } from '../../domain/signal/signal.entity';
import {
  TriggerDirection,
  TriggerRule,
} from '../../domain/trigger/trigger-rule.entity';

export type TelegramSignalFormatContext = {
  exchangeId: ExchangeId;
};

@injectable()
export class TelegramSignalMessageFormatter {
  public formatSignal(
    signal: Signal,
    rule: TriggerRule | null,
    context: TelegramSignalFormatContext,
  ): string {
    const metadata = this.parseMetadata(signal.metadataJson);
    const metrics =
      metadata && typeof metadata === 'object' && 'metrics' in metadata
        ? (metadata.metrics as Record<string, unknown>)
        : undefined;
    const isLong = rule?.oiDirection !== TriggerDirection.DOWN;
    const exchangeTitle = this.formatExchange(context.exchangeId);
    const windowTitle = rule ? `${rule.oiGrowthMaxWindowMinutes}m` : 'n/a';
    const oiPercent =
      rule?.oiDirection === TriggerDirection.DOWN
        ? metrics?.oiDropPercent
        : metrics?.oiGrowthPercent;

    return [
      `${isLong ? '🟢' : '🔴'} №${signal.signalNumberForDay} | ${isLong ? 'LONG' : 'SHORT'} | <b>${exchangeTitle}</b> | <b>${signal.symbol}</b>`,
      `⏱️ Окно: <b>${windowTitle}</b>`,
      `📈 OI: <b>${this.formatSignedPercent(oiPercent, rule?.oiDirection)}</b>`,
      `💹 Изменение цены: <b>${this.formatSignedPercent(metrics?.priceChangePercent)}</b>`,
      `🟩 Объема в <b>${this.formatMultiplier(metrics?.volumeRatio)}</b> раз`,
      `⚖️ Дельта: <b>${this.formatSignedNumber(metrics?.latestDeltaRatio)}</b>`,
    ].join('\n');
  }

  private parseMetadata(
    metadataJson: string | null,
  ): { metrics?: Record<string, unknown> } | null {
    if (!metadataJson) {
      return null;
    }

    try {
      return JSON.parse(metadataJson) as { metrics?: Record<string, unknown> };
    } catch {
      return null;
    }
  }

  private formatSignedPercent(
    value: unknown,
    direction?: TriggerDirection,
  ): string {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 'n/a';
    }

    const sign =
      direction === TriggerDirection.DOWN
        ? '-'
        : value > 0
          ? '+'
          : value < 0
            ? '-'
            : '';

    return `${sign}${Math.abs(value).toFixed(2)}%`;
  }

  private formatSignedNumber(value: unknown): string {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 'n/a';
    }

    const sign = value > 0 ? '+' : value < 0 ? '-' : '';
    return `${sign}${Math.abs(value).toFixed(2)}`;
  }

  private formatMultiplier(value: unknown): string {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 'n/a';
    }

    return value.toFixed(2);
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
