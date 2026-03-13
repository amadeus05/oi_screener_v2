import 'dotenv/config';
import 'reflect-metadata';
import { MarketDataBuffer } from './application/market/market-data-buffer';
import { MarketMetricsCalculator } from './application/market/market-metrics-calculator';
import { TelegramBotService } from './application/telegram/telegram-bot.service';
import { MinuteAlignedEvaluationScheduler } from './application/trigger/minute-aligned-evaluation-scheduler';
import { MinuteRuleEvaluationJob } from './application/trigger/minute-rule-evaluation-job';
import { AppConfig } from './config/app.config';
import { createContainer } from './di/container';
import { ExchangeProviderResolver } from './di/exchange-provider.resolver';
import { TYPES } from './di/types';

async function bootstrap(): Promise<void> {
  console.log('[startup] creating container');
  const container = createContainer();
  console.log('[startup] resolving services');
  const resolver = container.get<ExchangeProviderResolver>(TYPES.ExchangeProviderResolver);
  const buffer = container.get<MarketDataBuffer>(TYPES.MarketDataBuffer);
  const appConfig = container.get<AppConfig>(TYPES.AppConfig);
  const metricsCalculator = container.get<MarketMetricsCalculator>(
    TYPES.MarketMetricsCalculator,
  );
  const minuteRuleEvaluationJob = container.get<MinuteRuleEvaluationJob>(
    TYPES.MinuteRuleEvaluationJob,
  );
  const telegramBotService = container.get<TelegramBotService>(
    TYPES.TelegramBotService,
  );
  const minuteAlignedEvaluationScheduler = container.get<MinuteAlignedEvaluationScheduler>(
    TYPES.MinuteAlignedEvaluationScheduler,
  );
  const provider = resolver.getActiveProvider();

  console.log('[startup] starting telegram');
  void telegramBotService.start();

  console.log('[startup] loading symbols');
  const allSymbols = await provider.getSupportedSymbols();
  const symbols =
    appConfig.symbolsLimit !== null
      ? allSymbols.slice(0, appConfig.symbolsLimit)
      : allSymbols;
  await telegramBotService.setTrackedSymbolsCount(symbols.length);

  console.log(`Active exchange: ${provider.getExchangeId()}`);
  console.log(`Tracking ${symbols.length} symbols.`);

  console.log('[startup] subscribing to candles');
  await provider.subscribeTo1mCandles(symbols, (candle) => {
    buffer.appendCandle(candle);
    console.log(
      `[candle] ${candle.symbol} close=${candle.close} volume=${candle.volume} at=${candle.closeTime.toISOString()}`,
    );
  });

  console.log('[startup] subscribing to trades');
  await provider.subscribeToTrades(symbols, (trade) => {
    buffer.appendTrade(trade);
  });

  console.log('[startup] starting OI polling');
  await provider.startOpenInterestPolling(symbols, (point) => {
    buffer.appendOpenInterest(point);
    console.log(
      `[oi] ${point.symbol} oi=${point.openInterest} at=${point.timestamp.toISOString()}`,
    );
  });

  console.log('[startup] starting evaluation scheduler');
  setInterval(() => {
    const symbol = symbols[0];
    const snapshot = buffer.getSnapshot(symbol);
    const metrics = metricsCalculator.calculate(snapshot, 30);

    console.log(
      `[snapshot] ${symbol} candles=${snapshot.candles.length} trades=${snapshot.trades.length} minuteDelta=${snapshot.minuteTradeDeltas.length} oi=${snapshot.openInterestPoints.length} progress=${snapshot.warmupProgress.toFixed(2)}`,
    );
    console.log(
      `[metrics] ${symbol} deltaRatio=${metrics.latestDeltaRatio ?? 'n/a'} deltaNotional=${metrics.latestDeltaNotional ?? 'n/a'} volumeRatio=${metrics.volumeRatio ?? 'n/a'} priceChangePct=${metrics.priceChangePercent ?? 'n/a'} oiGrowthPct=${metrics.oiGrowthPercent ?? 'n/a'}`,
    );
  }, 30_000);

  await minuteAlignedEvaluationScheduler.start(async (evaluationMinute) => {
    const createdSignals = await minuteRuleEvaluationJob.run(
      symbols,
      evaluationMinute,
    );

    if (createdSignals.length > 0) {
      console.log(
        `[signals] minute=${evaluationMinute.toISOString()} created=${createdSignals.length}`,
      );

      await Promise.all(
        createdSignals.map((signal) => telegramBotService.sendSignal(signal)),
      );
    }
  });

  console.log('[startup] bot is running');
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
