import { inject, injectable } from 'inversify';
import { Context, Markup, Telegraf } from 'telegraf';
import { ReplyKeyboardMarkup } from 'telegraf/types';
import { AppConfig } from '../../config/app.config';
import { TelegramConfig } from '../../config/telegram.config';
import { ExchangeId } from '../../domain/market/exchange-market-data-provider.interface';
import { Signal } from '../../domain/signal/signal.entity';
import { SignalsRepository } from '../../domain/signal/signals.repository';
import { TelegramSubscribersRepository } from '../../domain/telegram/telegram-subscribers.repository';
import {
  TriggerDirection,
  TriggerRule,
  TriggerRuleStatus,
} from '../../domain/trigger/trigger-rule.entity';
import { TriggersRepository } from '../../domain/trigger/triggers.repository';
import { TYPES } from '../../di/types';
import { TelegramSignalMessageFormatter } from './telegram-signal-message-formatter';
import { SignalChartDataBuilder } from '../chart/signal-chart-data-builder';
import { SignalChartRenderer } from '../chart/signal-chart-renderer';
import { TelegramSendQueueService } from './telegram-send-queue.service';
import {
  TelegramTriggerSessionStore,
  TriggerWizardDraft,
  TriggerWizardSession,
} from './telegram-trigger-session.store';
import { TriggerManagementService } from '../trigger/trigger-management.service';
import { BotStatusService } from '../status/bot-status.service';

type BotContext = Context;
type TriggerEditFieldCode = 'n' | 'd' | 'p' | 'w' | 'c' | 'v' | 'l' | 'r';
const TELEGRAM_MENU: ReplyKeyboardMarkup = {
  keyboard: [
    [{ text: '🧩 Список тригеров' }, { text: '➕ Добавить тригер' }],
    [{ text: '📊 Статус' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

@injectable()
export class TelegramBotService {
  private readonly bot: Telegraf<BotContext> | null;
  private readonly triggerEditFieldCodeMap: Record<TriggerEditFieldCode, string> = {
    n: 'name',
    d: 'direction',
    p: 'percent',
    w: 'window',
    c: 'cooldown',
    v: 'min_volume',
    l: 'min_delta',
    r: 'min_price',
  };

  public constructor(
    @inject(TYPES.AppConfig)
    private readonly appConfig: AppConfig,
    @inject(TYPES.TelegramConfig)
    private readonly config: TelegramConfig,
    @inject(TYPES.TriggersRepository)
    private readonly triggersRepository: TriggersRepository,
    @inject(TYPES.SignalsRepository)
    private readonly signalsRepository: SignalsRepository,
    @inject(TYPES.TelegramSubscribersRepository)
    private readonly telegramSubscribersRepository: TelegramSubscribersRepository,
    @inject(TYPES.TriggerManagementService)
    private readonly triggerManagementService: TriggerManagementService,
    @inject(TYPES.TelegramTriggerSessionStore)
    private readonly sessionStore: TelegramTriggerSessionStore,
    @inject(TYPES.BotStatusService)
    private readonly botStatusService: BotStatusService,
    @inject(TYPES.TelegramSendQueueService)
    private readonly sendQueue: TelegramSendQueueService,
    @inject(TYPES.SignalChartRenderer)
    private readonly signalChartRenderer: SignalChartRenderer,
    @inject(TYPES.SignalChartDataBuilder)
    private readonly signalChartDataBuilder: SignalChartDataBuilder,
    @inject(TYPES.TelegramSignalMessageFormatter)
    private readonly formatter: TelegramSignalMessageFormatter,
  ) {
    this.bot = this.config.enabled ? new Telegraf<BotContext>(this.config.botToken) : null;
  }

  public async start(): Promise<void> {
    if (!this.bot) {
      console.log('[telegram] disabled: TELEGRAM_BOT_TOKEN is not configured');
      return;
    }

    this.registerHandlers();
    this.bot.catch((error) => {
      console.error('[telegram] runtime error', error);
    });

    try {
      console.log('[telegram] checking bot credentials');
      const me = await this.bot.telegram.getMe();
      console.log(`[telegram] authorized as @${me.username}`);

      console.log('[telegram] resetting webhook');
      await this.bot.telegram.deleteWebhook({
        drop_pending_updates: false,
      });

      await this.bot.telegram.setMyCommands([
        { command: 'start', description: 'Open control panel' },
        { command: 'triggers', description: 'Show triggers list' },
        { command: 'new_trigger', description: 'Create new trigger' },
        { command: 'signals', description: 'Show recent signals' },
        { command: 'status', description: 'Show bot status' },
      ]);

      console.log('[telegram] starting long polling');
      void this.bot.launch().catch((error) => {
        console.error('[telegram] long polling failed', error);
      });
      console.log('[telegram] bot started');
    } catch (error) {
      console.error('[telegram] failed to start', error);
    }
  }

  public async sendSignal(signal: Signal): Promise<void> {
    if (!this.bot) {
      return;
    }

    const rule = await this.triggersRepository.findById(signal.ruleId);
    const message = this.formatter.formatSignal(signal, rule, {
      exchangeId: this.appConfig.activeExchange,
    });
    const targetChatIds = await this.getTargetChatIds();

    if (targetChatIds.length === 0) {
      console.warn('[telegram] no target chats available for signal delivery');
      return;
    }

    if (this.config.signalChartEnabled && rule) {
      const metadata = this.parseSignalMetadata(signal.metadataJson);
      const snapshot = metadata?.snapshot as {
        symbol: string;
        candles: unknown[];
        openInterestPoints: unknown[];
        minuteTradeDeltas: unknown[];
      } | undefined;

      if (snapshot) {
        try {
          const chartInput = this.signalChartDataBuilder.build(
            snapshot as never,
            signal.signalNumberForDay,
            this.appConfig.activeExchange,
            rule.oiDirection,
          );
          const image = await this.signalChartRenderer.renderPngBuffer(chartInput);

          await Promise.all(
            targetChatIds.map((chatId) =>
              this.sendQueue.enqueue(() =>
                this.bot!.telegram.sendPhoto(
                  chatId,
                  { source: image, filename: `${signal.symbol}-${signal.signalNumberForDay}.png` },
                  {
                    caption: message,
                    parse_mode: 'HTML',
                  },
                ),
              ),
            ),
          );
          return;
        } catch (error) {
          console.error('[telegram] failed to render signal chart', error);
        }
      }
    }

    await Promise.all(
      targetChatIds.map((chatId) =>
        this.sendQueue.enqueue(() =>
          this.bot!.telegram.sendMessage(chatId, message, {
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('Triggers', 'menu:triggers')],
              [Markup.button.callback('Recent Signals', 'menu:signals')],
            ]).reply_markup,
          }),
        ),
      ),
    );
  }

  private registerHandlers(): void {
    if (!this.bot) {
      return;
    }

    this.bot.start(async (ctx: BotContext) => {
      if (!this.isAllowed(ctx)) {
        return;
      }

      await this.registerSubscriber(ctx);
      await ctx.reply(
        '🎛️ <b>Pump Screener Control Panel</b>\nChoose an action below.',
        {
          parse_mode: 'HTML',
          reply_markup: TELEGRAM_MENU,
        },
      );
    });

    this.bot.command('triggers', async (ctx: BotContext) => {
      if (!this.isAllowed(ctx)) {
        return;
      }

      await this.showTriggersMenu(ctx);
    });

    this.bot.command('signals', async (ctx: BotContext) => {
      if (!this.isAllowed(ctx)) {
        return;
      }

      const signals = await this.signalsRepository.findRecent(10);
      await ctx.reply(await this.formatSignalsText(signals), {
        parse_mode: 'HTML',
      });
    });

    this.bot.command('new_trigger', async (ctx: BotContext) => {
      if (!this.isAllowed(ctx)) {
        return;
      }

      await this.startCreateTrigger(ctx);
    });

    this.bot.command('status', async (ctx: BotContext) => {
      if (!this.isAllowed(ctx)) {
        return;
      }

      await ctx.reply(await this.formatStatusText(), {
        parse_mode: 'HTML',
        reply_markup: TELEGRAM_MENU,
      });
    });

    this.bot.action('menu:triggers', async (ctx: BotContext) => {
      if (!this.isAllowed(ctx)) {
        return;
      }

      await this.showTriggersMenu(ctx, true);
    });

    this.bot.action('trigger:create:start', async (ctx: BotContext) => {
      if (!this.isAllowed(ctx)) {
        return;
      }

      await this.startCreateTrigger(ctx, true);
    });

    this.bot.action(/^trigger:toggle:(.+)$/, async (ctx: BotContext & { match: RegExpExecArray }) => {
      if (!this.isAllowed(ctx)) {
        return;
      }

      const ruleId = ctx.match[1];
      const rule = await this.triggersRepository.findById(ruleId);

      if (!rule) {
        await ctx.answerCbQuery('Rule not found');
        return;
      }

      await this.triggersRepository.updateStatus(
        rule.id,
        rule.status !== TriggerRuleStatus.ACTIVE,
      );

      await this.showTriggersMenu(ctx, true);
      await ctx.answerCbQuery('Updated');
    });

    this.bot.action(/^trigger:edit:(.+)$/, async (ctx: BotContext & { match: RegExpExecArray }) => {
      if (!this.isAllowed(ctx)) {
        return;
      }

      const ruleId = ctx.match[1];
      const rule = await this.triggersRepository.findById(ruleId);

      if (!rule) {
        await ctx.answerCbQuery('Rule not found');
        return;
      }

      await ctx.editMessageText(this.formatEditRuleText(rule), {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback('✏️ Name', this.buildTriggerEditFieldCallback(rule.id, 'n')),
            Markup.button.callback('↕️ Direction', this.buildTriggerEditFieldCallback(rule.id, 'd')),
          ],
          [
            Markup.button.callback('📈 Percent', this.buildTriggerEditFieldCallback(rule.id, 'p')),
            Markup.button.callback('⏱️ Window', this.buildTriggerEditFieldCallback(rule.id, 'w')),
          ],
          [
            Markup.button.callback('🧊 Cooldown', this.buildTriggerEditFieldCallback(rule.id, 'c')),
            Markup.button.callback('📊 Volume', this.buildTriggerEditFieldCallback(rule.id, 'v')),
          ],
          [
            Markup.button.callback('⚖️ Delta', this.buildTriggerEditFieldCallback(rule.id, 'l')),
            Markup.button.callback('💹 Price', this.buildTriggerEditFieldCallback(rule.id, 'r')),
          ],
          [
            Markup.button.callback(
              rule.status === TriggerRuleStatus.ACTIVE ? '🟢 ON' : '⚪️ OFF',
              `trigger:toggle:${rule.id}`,
            ),
            Markup.button.callback('🗑️ Delete', `trigger:delete:${rule.id}`),
          ],
          [Markup.button.callback('⬅️ Back', 'menu:triggers')],
        ]).reply_markup,
      });
    });

    this.bot.action(/^trigger:ef:([^:]+):([ndpwcvlr])$/, async (ctx: BotContext & { match: RegExpExecArray }) => {
      if (!this.isAllowed(ctx)) {
        return;
      }

      const ruleId = ctx.match[1];
      const field = this.parseTriggerEditFieldCode(ctx.match[2] as TriggerEditFieldCode);
      const rule = await this.triggersRepository.findById(ruleId);

      if (!rule) {
        await ctx.answerCbQuery('Rule not found');
        return;
      }

      const session = this.createEditSession(ruleId, field, rule);
      this.sessionStore.set(this.getChatId(ctx), session);

      await ctx.reply(this.getPromptForStep(session.step), {
        parse_mode: 'HTML',
        reply_markup:
          field === 'direction'
            ? Markup.inlineKeyboard([
                [
                  Markup.button.callback('📈 UP', 'wizard:direction:UP'),
                  Markup.button.callback('📉 DOWN', 'wizard:direction:DOWN'),
                ],
              ]).reply_markup
            : undefined,
      });
      await ctx.answerCbQuery('Editing');
    });

    this.bot.action(/^trigger:delete:(.+)$/, async (ctx: BotContext & { match: RegExpExecArray }) => {
      if (!this.isAllowed(ctx)) {
        return;
      }

      await this.triggerManagementService.delete(ctx.match[1]);
      await this.showTriggersMenu(ctx, true);
      await ctx.answerCbQuery('Deleted');
    });

    this.bot.action(/^wizard:direction:(UP|DOWN)$/, async (ctx: BotContext & { match: RegExpExecArray }) => {
      if (!this.isAllowed(ctx)) {
        return;
      }

      const chatId = this.getChatId(ctx);
      const session = this.sessionStore.get(chatId);

      if (!session) {
        await ctx.answerCbQuery('No active wizard');
        return;
      }

      session.draft.oiDirection = ctx.match[1] as TriggerDirection;
      await this.advanceWizard(ctx, session, true);
      await ctx.answerCbQuery('Saved');
    });

    this.bot.action('menu:signals', async (ctx: BotContext) => {
      if (!this.isAllowed(ctx)) {
        return;
      }

      const signals = await this.signalsRepository.findRecent(10);
      await ctx.editMessageText(await this.formatSignalsText(signals), {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('⬅️ Back', 'menu:triggers')],
        ]).reply_markup,
      });
    });

    this.bot.on('text', async (ctx: BotContext) => {
      if (!this.isAllowed(ctx)) {
        return;
      }

      const message = ctx.message;
      const text = message && 'text' in message ? message.text.trim() : '';

      if (text === '🧩 Список тригеров') {
        await this.showTriggersMenu(ctx);
        return;
      }

      if (text === '➕ Добавить тригер') {
        await this.startCreateTrigger(ctx);
        return;
      }

      if (text === '📊 Статус') {
        await ctx.reply(await this.formatStatusText(), {
          parse_mode: 'HTML',
          reply_markup: TELEGRAM_MENU,
        });
        return;
      }

      const chatId = this.getChatId(ctx);
      const session = this.sessionStore.get(chatId);

      if (!session) {
        return;
      }

      if (!text) {
        return;
      }

      try {
        await this.applyWizardInput(ctx, session, text);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Invalid input, try again.';
        await ctx.reply(`⚠️ ${message}`);
      }
    });
  }

  private isAllowed(ctx: BotContext): boolean {
    if (!this.config.allowedChatId) {
      return true;
    }

    return String(ctx.chat?.id ?? '') === this.config.allowedChatId;
  }

  private formatRulesText(rules: TriggerRule[]): string {
    if (rules.length === 0) {
      return '🧩 <b>No triggers configured.</b>\nTap <b>New Trigger</b> to create the first one.';
    }

    return rules
      .map((rule, index) => {
        const direction = rule.oiDirection === TriggerDirection.UP ? 'UP' : 'DOWN';
        const status = rule.status === TriggerRuleStatus.ACTIVE ? 'ACTIVE' : 'DISABLED';
        const directionEmoji =
          rule.oiDirection === TriggerDirection.UP ? '📈' : '📉';

        return [
          `${rule.status === TriggerRuleStatus.ACTIVE ? '🟢' : '⚪️'} <b>${index + 1}. ${rule.name}</b>`,
          `├ Status: <b>${status}</b>`,
          `├ OI: <code>${direction} ${rule.oiGrowthPercent}% in ${rule.oiGrowthMaxWindowMinutes}m</code> ${directionEmoji}`,
          `├ Cooldown: <code>${rule.cooldownMinutes}m</code>`,
          `└ Filters: <code>V ${rule.minVolumeRatio ?? '-'} | Δ ${rule.minDeltaRatio ?? '-'} | P ${rule.minPriceChangePercent ?? '-'}</code>`,
        ].join('\n');
      })
      .join('\n\n');
  }

  private async formatSignalsText(signals: Signal[]): Promise<string> {
    if (signals.length === 0) {
      return 'No signals yet.';
    }

    const lines: string[] = [];

    for (const signal of signals) {
      const rule = await this.triggersRepository.findById(signal.ruleId);
      lines.push(
        this.formatter.formatSignal(signal, rule, {
          exchangeId: this.appConfig.activeExchange,
        }),
      );
    }

    return lines.join('\n\n');
  }

  private async showTriggersMenu(
    ctx: BotContext,
    edit = false,
  ): Promise<void> {
    const rules = await this.triggersRepository.findAll();
    const buttons = [
      ...rules.flatMap((rule, index) => [
        [
          Markup.button.callback(
            `${index + 1}. ${rule.name}`,
            `trigger:edit:${rule.id}`,
          ),
          Markup.button.callback(
            rule.status === TriggerRuleStatus.ACTIVE ? '🟢 ON' : '⚪️ OFF',
            `trigger:toggle:${rule.id}`,
          ),
          Markup.button.callback('🗑️', `trigger:delete:${rule.id}`),
        ],
      ]),
      [
        Markup.button.callback('➕ New Trigger', 'trigger:create:start'),
        Markup.button.callback('📡 Recent Signals', 'menu:signals'),
      ],
    ];

    const text = `🧩 <b>Trigger Manager</b>\n\n${this.formatRulesText(rules)}`;

    if (edit && 'editMessageText' in ctx) {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
      });
      return;
    }

    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
    });
  }

  private async startCreateTrigger(
    ctx: BotContext,
    edit = false,
  ): Promise<void> {
    const session: TriggerWizardSession = {
      mode: 'CREATE',
      step: 'NAME',
      draft: {},
    };

    this.sessionStore.set(this.getChatId(ctx), session);

    const text =
      '✨ <b>Create New Trigger</b>\n\nSend a trigger name.\nExample: <code>BTC OI Up Fast</code>';

    if (edit && 'editMessageText' in ctx) {
      await ctx.editMessageText(text, { parse_mode: 'HTML' });
      return;
    }

    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: TELEGRAM_MENU,
    });
  }

  private async applyWizardInput(
    ctx: BotContext,
    session: TriggerWizardSession,
    text: string,
  ): Promise<void> {
    switch (session.step) {
      case 'NAME':
        session.draft.name = text;
        session.step = 'DIRECTION';
        this.sessionStore.set(this.getChatId(ctx), session);
        await ctx.reply(this.getPromptForStep('DIRECTION'), {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [
              Markup.button.callback('📈 UP', 'wizard:direction:UP'),
              Markup.button.callback('📉 DOWN', 'wizard:direction:DOWN'),
            ],
          ]).reply_markup,
        });
        return;
      case 'PERCENT':
        session.draft.oiGrowthPercent = this.parsePositiveNumber(text, 'Percent');
        return this.advanceWizard(ctx, session);
      case 'WINDOW':
        session.draft.oiGrowthMaxWindowMinutes = this.parsePositiveInteger(text, 'Window');
        return this.advanceWizard(ctx, session);
      case 'COOLDOWN':
        session.draft.cooldownMinutes = this.parsePositiveInteger(text, 'Cooldown');
        return this.advanceWizard(ctx, session);
      case 'MIN_VOLUME':
        session.draft.minVolumeRatio = this.parseOptionalNumber(text);
        return this.advanceWizard(ctx, session);
      case 'MIN_DELTA':
        session.draft.minDeltaRatio = this.parseOptionalNumber(text);
        return this.advanceWizard(ctx, session);
      case 'MIN_PRICE':
        session.draft.minPriceChangePercent = this.parseOptionalNumber(text);
        return this.advanceWizard(ctx, session);
      default:
        return;
    }
  }

  private async advanceWizard(
    ctx: BotContext,
    session: TriggerWizardSession,
    fromAction = false,
  ): Promise<void> {
    session.step = this.getNextStep(session.step);
    this.sessionStore.set(this.getChatId(ctx), session);

    if (session.step === 'CONFIRM') {
      await this.finishWizard(ctx, session, fromAction);
      return;
    }

    const replyMarkup =
      session.step === 'DIRECTION'
        ? Markup.inlineKeyboard([
            [
              Markup.button.callback('📈 UP', 'wizard:direction:UP'),
              Markup.button.callback('📉 DOWN', 'wizard:direction:DOWN'),
            ],
          ]).reply_markup
        : undefined;

    await ctx.reply(this.getPromptForStep(session.step), {
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    });
  }

  private async finishWizard(
    ctx: BotContext,
    session: TriggerWizardSession,
    _fromAction: boolean,
  ): Promise<void> {
    const draft = session.draft;

    if (session.mode === 'CREATE') {
      const created = await this.triggerManagementService.create({
        name: draft.name!,
        oiDirection: draft.oiDirection!,
        oiGrowthPercent: draft.oiGrowthPercent!,
        oiGrowthMaxWindowMinutes: draft.oiGrowthMaxWindowMinutes!,
        cooldownMinutes: draft.cooldownMinutes!,
        minVolumeRatio: draft.minVolumeRatio ?? null,
        minDeltaRatio: draft.minDeltaRatio ?? null,
        minPriceChangePercent: draft.minPriceChangePercent ?? null,
      });

      this.sessionStore.clear(this.getChatId(ctx));
      await ctx.reply(
        `✅ <b>Trigger created</b>\n\n${this.formatRulesText([created])}`,
        {
          parse_mode: 'HTML',
          reply_markup: TELEGRAM_MENU,
        },
      );
      return;
    }

    await this.triggerManagementService.update(session.draft.ruleId!, draft);
    this.sessionStore.clear(this.getChatId(ctx));
    await ctx.reply('✅ <b>Trigger updated</b>', {
      parse_mode: 'HTML',
      reply_markup: TELEGRAM_MENU,
    });
  }

  private buildTriggerEditFieldCallback(
    ruleId: string,
    fieldCode: TriggerEditFieldCode,
  ): string {
    return `trigger:ef:${ruleId}:${fieldCode}`;
  }

  private parseTriggerEditFieldCode(fieldCode: TriggerEditFieldCode): string {
    return this.triggerEditFieldCodeMap[fieldCode];
  }

  private createEditSession(
    ruleId: string,
    field: string,
    rule: TriggerRule,
  ): TriggerWizardSession {
    const baseDraft: TriggerWizardDraft = {
      ruleId,
      name: rule.name,
      oiDirection: rule.oiDirection,
      oiGrowthPercent: rule.oiGrowthPercent,
      oiGrowthMaxWindowMinutes: rule.oiGrowthMaxWindowMinutes,
      cooldownMinutes: rule.cooldownMinutes,
      minVolumeRatio: rule.minVolumeRatio,
      minDeltaRatio: rule.minDeltaRatio,
      minPriceChangePercent: rule.minPriceChangePercent,
    };

    const stepByField: Record<string, TriggerWizardSession['step']> = {
      name: 'NAME',
      direction: 'DIRECTION',
      percent: 'PERCENT',
      window: 'WINDOW',
      cooldown: 'COOLDOWN',
      min_volume: 'MIN_VOLUME',
      min_delta: 'MIN_DELTA',
      min_price: 'MIN_PRICE',
    };

    return {
      mode: 'EDIT',
      step: stepByField[field] ?? 'NAME',
      draft: baseDraft,
    };
  }

  private formatEditRuleText(rule: TriggerRule): string {
    return [
      `🛠️ <b>Edit Trigger</b>`,
      ``,
      `🏷️ Name: <b>${rule.name}</b>`,
      `↕️ Direction: <b>${rule.oiDirection}</b>`,
      `📈 Percent: <b>${rule.oiGrowthPercent}%</b>`,
      `⏱️ Window: <b>${rule.oiGrowthMaxWindowMinutes}m</b>`,
      `🧊 Cooldown: <b>${rule.cooldownMinutes}m</b>`,
      `📊 Min Volume: <b>${rule.minVolumeRatio ?? 'off'}</b>`,
      `⚖️ Min Delta: <b>${rule.minDeltaRatio ?? 'off'}</b>`,
      `💹 Min Price: <b>${rule.minPriceChangePercent ?? 'off'}</b>`,
    ].join('\n');
  }

  private getPromptForStep(step: TriggerWizardSession['step']): string {
    switch (step) {
      case 'DIRECTION':
        return '↕️ <b>Select OI direction</b>';
      case 'PERCENT':
        return '📈 <b>Enter OI percent</b>\nExample: <code>1.5</code>';
      case 'WINDOW':
        return '⏱️ <b>Enter max window in minutes</b>\nExample: <code>30</code>';
      case 'COOLDOWN':
        return '🧊 <b>Enter cooldown in minutes</b>\nExample: <code>3</code>';
      case 'MIN_VOLUME':
        return '📊 <b>Enter minimum volume ratio</b>\nSend <code>skip</code> to disable.';
      case 'MIN_DELTA':
        return '⚖️ <b>Enter minimum delta ratio</b>\nSend <code>skip</code> to disable.';
      case 'MIN_PRICE':
        return '💹 <b>Enter minimum price change %</b>\nSend <code>skip</code> to disable.';
      case 'NAME':
      case 'CONFIRM':
      default:
        return '✏️ <b>Enter name</b>';
    }
  }

  private getNextStep(
    current: TriggerWizardSession['step'],
  ): TriggerWizardSession['step'] {
    const orderedSteps: TriggerWizardSession['step'][] = [
      'NAME',
      'DIRECTION',
      'PERCENT',
      'WINDOW',
      'COOLDOWN',
      'MIN_VOLUME',
      'MIN_DELTA',
      'MIN_PRICE',
      'CONFIRM',
    ];

    const currentIndex = orderedSteps.indexOf(current);
    return orderedSteps[Math.min(currentIndex + 1, orderedSteps.length - 1)];
  }

  private parsePositiveNumber(value: string, label: string): number {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`${label} must be a positive number.`);
    }

    return parsed;
  }

  private parsePositiveInteger(value: string, label: string): number {
    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`${label} must be a positive integer.`);
    }

    return parsed;
  }

  private parseOptionalNumber(value: string): number | null {
    if (value.toLowerCase() === 'skip') {
      return null;
    }

    return this.parsePositiveNumber(value, 'Value');
  }

  private getChatId(ctx: BotContext): string {
    return String(ctx.chat?.id ?? '');
  }

  private parseSignalMetadata(metadataJson: string | null): Record<string, unknown> | null {
    if (!metadataJson) {
      return null;
    }

    try {
      return JSON.parse(metadataJson) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  public async setTrackedSymbolsCount(count: number): Promise<void> {
    this.botStatusService.setTrackedSymbolsCount(count);
  }

  private async registerSubscriber(ctx: BotContext): Promise<void> {
    const chatId = this.getChatId(ctx);

    if (!chatId) {
      return;
    }

    const alreadyExists = await this.telegramSubscribersRepository.exists(chatId);
    await this.telegramSubscribersRepository.save(chatId);

    if (!alreadyExists) {
      const blue = '\x1b[34m';
      const reset = '\x1b[0m';
      const username =
        ctx.from?.username?.trim() ||
        [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ').trim() ||
        'unknown';

      console.log(
        `[telegram] new subscriber connected user=${username} chat_id=${blue}${chatId}${reset}`,
      );
    }
  }

  private async getTargetChatIds(): Promise<string[]> {
    if (this.config.allowedChatId) {
      return [this.config.allowedChatId];
    }

    const subscribers = await this.telegramSubscribersRepository.findAll();
    return subscribers.map((subscriber) => subscriber.chatId);
  }

  private async formatStatusText(): Promise<string> {
    const status = await this.botStatusService.getStatus();

    return [
      '📊 <b>Bot Status</b>',
      `⏱️ Uptime: <b>${status.uptimeText}</b>`,
      `🪙 Tracked coins: <b>${status.trackedSymbolsCount}</b>`,
      `⛔️ Blacklist: <b>${status.blacklistedSymbolsCount}</b>`,
      `🚨 Signals today: <b>${status.signalsTodayCount}</b>`,
    ].join('\n');
  }
}


