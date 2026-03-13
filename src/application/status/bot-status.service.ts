import { injectable } from 'inversify';
import { AppConfig } from '../../config/app.config';
import { SignalsRepository } from '../../domain/signal/signals.repository';

export type BotStatus = {
  startedAt: Date;
  uptimeText: string;
  trackedSymbolsCount: number;
  blacklistedSymbolsCount: number;
  signalsTodayCount: number;
};

@injectable()
export class BotStatusService {
  private readonly startedAt = new Date();
  private trackedSymbolsCount = 0;

  public constructor(
    private readonly appConfig: AppConfig,
    private readonly signalsRepository: SignalsRepository,
  ) {}

  public setTrackedSymbolsCount(count: number): void {
    this.trackedSymbolsCount = count;
  }

  public async getStatus(now: Date = new Date()): Promise<BotStatus> {
    const elapsedMs = now.getTime() - this.startedAt.getTime();
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const { dayStartUtc, dayEndUtc } = this.getUtcDayBounds(now);
    const signalsTodayCount = await this.signalsRepository.countAllOnDay(
      dayStartUtc,
      dayEndUtc,
    );

    return {
      startedAt: this.startedAt,
      uptimeText: `${hours}h ${minutes}m ${seconds}s`,
      trackedSymbolsCount: this.trackedSymbolsCount,
      blacklistedSymbolsCount: this.appConfig.symbolBlacklist.length,
      signalsTodayCount,
    };
  }

  private getUtcDayBounds(date: Date): {
    dayStartUtc: Date;
    dayEndUtc: Date;
  } {
    const dayStartUtc = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60_000);

    return {
      dayStartUtc,
      dayEndUtc,
    };
  }
}
