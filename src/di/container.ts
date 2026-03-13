import 'reflect-metadata';
import { Container } from 'inversify';
import { appConfig } from '../config/app.config';
import { AppConfig } from '../config/app.config';
import { ExchangeId } from '../domain/market/exchange-market-data-provider.interface';
import { TriggersRepository } from '../domain/trigger/triggers.repository';
import { SignalsRepository } from '../domain/signal/signals.repository';
import { TelegramSubscribersRepository } from '../domain/telegram/telegram-subscribers.repository';
import {
  pumpScreenerRuntimeConfig,
  PumpScreenerRuntimeConfig,
} from '../config/pump-screener.config';
import { telegramConfig, TelegramConfig } from '../config/telegram.config';
import { SignalChartDataBuilder } from '../application/chart/signal-chart-data-builder';
import { SignalChartRenderer } from '../application/chart/signal-chart-renderer';
import { BotStatusService } from '../application/status/bot-status.service';
import { MarketMetricsCalculator } from '../application/market/market-metrics-calculator';
import { MinuteTradeDeltaAggregator } from '../application/market/minute-trade-delta-aggregator';
import { TelegramBotService } from '../application/telegram/telegram-bot.service';
import { TelegramSendQueueService } from '../application/telegram/telegram-send-queue.service';
import { TelegramSignalMessageFormatter } from '../application/telegram/telegram-signal-message-formatter';
import { TelegramTriggerSessionStore } from '../application/telegram/telegram-trigger-session.store';
import { MinuteAlignedEvaluationScheduler } from '../application/trigger/minute-aligned-evaluation-scheduler';
import { MinuteRuleEvaluationJob } from '../application/trigger/minute-rule-evaluation-job';
import { TriggerManagementService } from '../application/trigger/trigger-management.service';
import { TriggerRuleEvaluator } from '../application/trigger/trigger-rule-evaluator';
import { sqliteConfig, SqliteConfig } from '../config/sqlite.config';
import { MarketDataBuffer } from '../application/market/market-data-buffer';
import { BinanceAdapter } from '../infrastructure/binance/binance.adapter';
import { BinanceMapper } from '../infrastructure/binance/binance.mapper';
import { BinanceOpenInterestPoller } from '../infrastructure/binance/binance-open-interest-poller';
import { BinanceService } from '../infrastructure/binance/binance.service';
import { BinanceWsFactory } from '../infrastructure/binance/binance-ws.factory';
import { BinanceWebSocketManager } from '../infrastructure/binance/binance-websocket-manager';
import { BybitAdapter } from '../infrastructure/bybit/bybit.adapter';
import { BybitMapper } from '../infrastructure/bybit/bybit.mapper';
import { BybitService } from '../infrastructure/bybit/bybit.service';
import { BybitWebSocketManager } from '../infrastructure/bybit/bybit-websocket-manager';
import { BybitWsFactory } from '../infrastructure/bybit/bybit-ws.factory';
import { SqliteConnection } from '../infrastructure/persistence/sqlite/sqlite-connection';
import { SqliteSignalsRepository } from '../infrastructure/persistence/sqlite/sqlite-signals.repository';
import { SqliteTelegramSubscribersRepository } from '../infrastructure/persistence/sqlite/sqlite-telegram-subscribers.repository';
import { SqliteTriggersRepository } from '../infrastructure/persistence/sqlite/sqlite-triggers.repository';
import {
  ExchangeProviderRegistry,
  ExchangeProviderResolver,
} from './exchange-provider.resolver';
import { TYPES } from './types';

export function createContainer(): Container {
  const container = new Container({
    defaultScope: 'Singleton',
  });

  container.bind<AppConfig>(TYPES.AppConfig).toConstantValue(appConfig);
  container.bind<TelegramConfig>(TYPES.TelegramConfig).toConstantValue(telegramConfig);
  container
    .bind<PumpScreenerRuntimeConfig>(TYPES.PumpScreenerRuntimeConfig)
    .toConstantValue(pumpScreenerRuntimeConfig);
  container.bind<SqliteConfig>(TYPES.SqliteConfig).toConstantValue(sqliteConfig);

  container.bind<BinanceService>(TYPES.BinanceService).to(BinanceService);
  container.bind<BinanceMapper>(TYPES.BinanceMapper).to(BinanceMapper);
  container.bind<BinanceWsFactory>(TYPES.BinanceWsFactory).to(BinanceWsFactory);
  container.bind<BinanceWebSocketManager>(TYPES.BinanceWebSocketManager).toDynamicValue((ctx) => {
    const factory = ctx.get<BinanceWsFactory>(TYPES.BinanceWsFactory);
    return new BinanceWebSocketManager(factory.create);
  });
  container.bind<BinanceOpenInterestPoller>(TYPES.BinanceOpenInterestPoller).to(BinanceOpenInterestPoller);
  container.bind<BinanceAdapter>(TYPES.BinanceAdapter).to(BinanceAdapter);
  container.bind<BybitService>(TYPES.BybitService).to(BybitService);
  container.bind<BybitMapper>(TYPES.BybitMapper).to(BybitMapper);
  container.bind<BybitWsFactory>(TYPES.BybitWsFactory).to(BybitWsFactory);
  container.bind<BybitWebSocketManager>(TYPES.BybitWebSocketManager).toDynamicValue((ctx) => {
    const factory = ctx.get<BybitWsFactory>(TYPES.BybitWsFactory);
    return new BybitWebSocketManager(factory.create);
  });
  container.bind<BybitAdapter>(TYPES.BybitAdapter).to(BybitAdapter);
  container.bind<MinuteTradeDeltaAggregator>(TYPES.MinuteTradeDeltaAggregator).to(MinuteTradeDeltaAggregator);
  container.bind<MarketMetricsCalculator>(TYPES.MarketMetricsCalculator).to(MarketMetricsCalculator);
  container.bind<TriggerRuleEvaluator>(TYPES.TriggerRuleEvaluator).to(TriggerRuleEvaluator);
  container.bind<TelegramSignalMessageFormatter>(TYPES.TelegramSignalMessageFormatter).to(
    TelegramSignalMessageFormatter,
  );
  container.bind<TelegramTriggerSessionStore>(TYPES.TelegramTriggerSessionStore).to(
    TelegramTriggerSessionStore,
  );
  container.bind<TelegramSendQueueService>(TYPES.TelegramSendQueueService).to(
    TelegramSendQueueService,
  );
  container.bind<SignalChartRenderer>(TYPES.SignalChartRenderer).to(SignalChartRenderer);
  container.bind<SignalChartDataBuilder>(TYPES.SignalChartDataBuilder).to(SignalChartDataBuilder);
  container.bind<BotStatusService>(TYPES.BotStatusService).toDynamicValue((ctx) => {
    const appConfig = ctx.get<AppConfig>(TYPES.AppConfig);
    const signalsRepository = ctx.get<SignalsRepository>(TYPES.SignalsRepository);

    return new BotStatusService(appConfig, signalsRepository);
  });
  container.bind<TelegramBotService>(TYPES.TelegramBotService).to(TelegramBotService);
  container.bind<TriggerManagementService>(TYPES.TriggerManagementService).toDynamicValue((ctx) => {
    const triggersRepository = ctx.get<TriggersRepository>(TYPES.TriggersRepository);
    return new TriggerManagementService(triggersRepository);
  });
  container.bind<MinuteAlignedEvaluationScheduler>(TYPES.MinuteAlignedEvaluationScheduler).toDynamicValue((ctx) => {
    const config = ctx.get<PumpScreenerRuntimeConfig>(
      TYPES.PumpScreenerRuntimeConfig,
    );

    return new MinuteAlignedEvaluationScheduler(config);
  });
  container.bind<MarketDataBuffer>(TYPES.MarketDataBuffer).toDynamicValue((ctx) => {
    const minuteTradeDeltaAggregator = ctx.get<MinuteTradeDeltaAggregator>(
      TYPES.MinuteTradeDeltaAggregator,
    );
    const config = ctx.get<PumpScreenerRuntimeConfig>(
      TYPES.PumpScreenerRuntimeConfig,
    );

    return new MarketDataBuffer(minuteTradeDeltaAggregator, config);
  });
  container.bind<SqliteConnection>(TYPES.SqliteConnection).toDynamicValue((ctx) => {
    const config = ctx.get<SqliteConfig>(TYPES.SqliteConfig);
    return new SqliteConnection(config.filePath);
  });
  container.bind<TriggersRepository>(TYPES.TriggersRepository).toDynamicValue((ctx) => {
    const connection = ctx.get<SqliteConnection>(TYPES.SqliteConnection);
    return new SqliteTriggersRepository(connection);
  });
  container.bind<SignalsRepository>(TYPES.SignalsRepository).toDynamicValue((ctx) => {
    const connection = ctx.get<SqliteConnection>(TYPES.SqliteConnection);
    return new SqliteSignalsRepository(connection);
  });
  container.bind<TelegramSubscribersRepository>(TYPES.TelegramSubscribersRepository).toDynamicValue((ctx) => {
    const connection = ctx.get<SqliteConnection>(TYPES.SqliteConnection);
    return new SqliteTelegramSubscribersRepository(connection);
  });
  container.bind<MinuteRuleEvaluationJob>(TYPES.MinuteRuleEvaluationJob).toDynamicValue((ctx) => {
    const triggersRepository = ctx.get<TriggersRepository>(TYPES.TriggersRepository);
    const signalsRepository = ctx.get<SignalsRepository>(TYPES.SignalsRepository);
    const marketDataBuffer = ctx.get<MarketDataBuffer>(TYPES.MarketDataBuffer);
    const triggerRuleEvaluator = ctx.get<TriggerRuleEvaluator>(TYPES.TriggerRuleEvaluator);

    return new MinuteRuleEvaluationJob(
      triggersRepository,
      signalsRepository,
      marketDataBuffer,
      triggerRuleEvaluator,
    );
  });

  container.bind<ExchangeProviderRegistry>(TYPES.ExchangeProviderRegistry).toDynamicValue((ctx) => {
    const registry: ExchangeProviderRegistry = new Map();

    registry.set(
      ExchangeId.BINANCE,
      ctx.get<BinanceAdapter>(TYPES.BinanceAdapter),
    );
    registry.set(
      ExchangeId.BYBIT,
      ctx.get<BybitAdapter>(TYPES.BybitAdapter),
    );

    return registry;
  });

  container.bind<ExchangeProviderResolver>(TYPES.ExchangeProviderResolver).to(
    ExchangeProviderResolver,
  );

  return container;
}
