import { inject, injectable, unmanaged } from 'inversify';
import {
  MarketSubscription,
  OpenInterestPoint,
} from '../../domain/market/exchange-market-data-provider.interface';
import { PumpScreenerRuntimeConfig } from '../../config/pump-screener.config';
import { TYPES } from '../../di/types';
import { BinanceMapper } from './binance.mapper';
import { BinanceService } from './binance.service';

export type BinanceOpenInterestPollerOptions = {
  pollIntervalMs: number;
  maxRequestsPerSecond: number;
};

@injectable()
export class BinanceOpenInterestPoller {
  public constructor(
    @inject(TYPES.BinanceService)
    private readonly service: BinanceService,
    @inject(TYPES.BinanceMapper)
    private readonly mapper: BinanceMapper,
    @inject(TYPES.PumpScreenerRuntimeConfig)
    runtimeConfig: PumpScreenerRuntimeConfig,
    @unmanaged()
    private readonly options: BinanceOpenInterestPollerOptions = {
      pollIntervalMs: runtimeConfig.oiPollIntervalMs,
      maxRequestsPerSecond: runtimeConfig.oiMaxRequestsPerSecond,
    },
  ) {}

  public async start(
    symbols: string[],
    onOpenInterestPoint: (point: OpenInterestPoint) => Promise<void> | void,
  ): Promise<MarketSubscription> {
    const uniqueSymbols = [...new Set(symbols)];
    let isClosed = false;
    const timeouts = new Set<ReturnType<typeof setTimeout>>();

    void this.runSequentialLoop(uniqueSymbols, onOpenInterestPoint, () => isClosed, timeouts);

    return {
      close: async () => {
        isClosed = true;
        timeouts.forEach((timeout) => clearTimeout(timeout));
        timeouts.clear();
      },
    };
  }

  private async runSequentialLoop(
    symbols: string[],
    onOpenInterestPoint: (point: OpenInterestPoint) => Promise<void> | void,
    isClosed: () => boolean,
    timeouts: Set<ReturnType<typeof setTimeout>>,
  ): Promise<void> {
    while (!isClosed()) {
      const cycleStartedAt = Date.now();

      try {
        await this.runCycle(symbols, onOpenInterestPoint, isClosed, timeouts);
      } catch {
        // Ignore cycle-level failure and continue polling on next cadence.
      }

      const elapsedMs = Date.now() - cycleStartedAt;
      const delayMs = Math.max(0, this.options.pollIntervalMs - elapsedMs);

      if (delayMs > 0 && !isClosed()) {
        await this.delay(delayMs, timeouts);
      }
    }
  }

  private async runCycle(
    symbols: string[],
    onOpenInterestPoint: (point: OpenInterestPoint) => Promise<void> | void,
    isClosed: () => boolean,
    timeouts: Set<ReturnType<typeof setTimeout>>,
  ): Promise<void> {
    const batchSize = this.options.maxRequestsPerSecond;

    for (let index = 0; index < symbols.length; index += batchSize) {
      if (isClosed()) {
        return;
      }

      const batch = symbols.slice(index, index + batchSize);

      const results = await Promise.allSettled(
        batch.map(async (symbol) => {
          const snapshot = await this.service.getOpenInterest(symbol);
          const point = this.mapper.toCurrentOpenInterestPoint(snapshot);
          await onOpenInterestPoint(point);
        }),
      );

      if (isClosed()) {
        return;
      }

      results.forEach(() => {
        return;
      });

      if (index + batchSize < symbols.length) {
        await this.delay(1_000, timeouts);
      }
    }
  }

  private async delay(
    milliseconds: number,
    timeouts: Set<ReturnType<typeof setTimeout>>,
  ): Promise<void> {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        timeouts.delete(timeout);
        resolve();
      }, milliseconds);

      timeouts.add(timeout);
    });
  }
}
