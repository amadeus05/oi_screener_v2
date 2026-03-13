import { inject, injectable } from 'inversify';
import { TelegramConfig } from '../../config/telegram.config';
import { TYPES } from '../../di/types';

type QueueTask<T> = {
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

type QueueTaskUnknown = {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

@injectable()
export class TelegramSendQueueService {
  private readonly queue: QueueTaskUnknown[] = [];
  private isProcessing = false;

  public constructor(
    @inject(TYPES.TelegramConfig)
    private readonly config: TelegramConfig,
  ) {}

  public enqueue<T>(run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        run: () => run() as Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      void this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();

      if (!task) {
        continue;
      }

      try {
        const result = await task.run();
        task.resolve(result);
      } catch (error) {
        task.reject(error);
      }

      if (this.queue.length > 0 && this.config.sendDelayMs > 0) {
        await this.delay(this.config.sendDelayMs);
      }
    }

    this.isProcessing = false;
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  }
}
