import { injectable } from 'inversify';
import { PumpScreenerRuntimeConfig } from '../../config/pump-screener.config';

export type MinuteSchedulerSubscription = {
  stop(): Promise<void>;
};

@injectable()
export class MinuteAlignedEvaluationScheduler {
  public constructor(
    private readonly config: PumpScreenerRuntimeConfig = {
      aggregationWindowMinutes: 60,
      maxRuleWindowMinutes: 30,
      warmupMinutes: 60,
      evaluationGracePeriodMs: 5_000,
      oiPollIntervalMs: 60_000,
      oiMaxRequestsPerSecond: 15,
    },
  ) {}

  public async start(
    onTick: (evaluationMinute: Date) => Promise<void>,
  ): Promise<MinuteSchedulerSubscription> {
    let isStopped = false;
    let currentTimeout: ReturnType<typeof setTimeout> | null = null;
    let lastEvaluatedMinuteMs: number | null = null;

    const scheduleNext = () => {
      if (isStopped) {
        return;
      }

      const now = Date.now();
      const nextMinuteCloseMs = this.getNextMinuteBoundaryMs(now);
      const targetRunMs = nextMinuteCloseMs + this.config.evaluationGracePeriodMs;
      const delayMs = Math.max(0, targetRunMs - now);

      currentTimeout = setTimeout(async () => {
        currentTimeout = null;

        if (isStopped) {
          return;
        }

        const evaluationMinuteMs = nextMinuteCloseMs;

        if (lastEvaluatedMinuteMs !== evaluationMinuteMs) {
          lastEvaluatedMinuteMs = evaluationMinuteMs;
          await onTick(new Date(evaluationMinuteMs));
        }

        scheduleNext();
      }, delayMs);
    };

    scheduleNext();

    return {
      stop: async () => {
        isStopped = true;

        if (currentTimeout) {
          clearTimeout(currentTimeout);
          currentTimeout = null;
        }
      },
    };
  }

  private getNextMinuteBoundaryMs(nowMs: number): number {
    const currentMinuteStartMs = nowMs - (nowMs % 60_000);
    return currentMinuteStartMs + 60_000;
  }
}
