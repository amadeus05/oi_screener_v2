export type TelegramConfig = {
  botToken: string;
  allowedChatId: string | null;
  enabled: boolean;
  signalChartEnabled: boolean;
  sendDelayMs: number;
};

export const telegramConfig: TelegramConfig = {
  botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  allowedChatId: process.env.TELEGRAM_ALLOWED_CHAT_ID ?? null,
  enabled: Boolean(process.env.TELEGRAM_BOT_TOKEN),
  signalChartEnabled: (process.env.TELEGRAM_SIGNAL_CHART_ENABLED ?? 'false') === 'true',
  sendDelayMs:
    process.env.TELEGRAM_SEND_DELAY_MS && Number(process.env.TELEGRAM_SEND_DELAY_MS) >= 0
      ? Number(process.env.TELEGRAM_SEND_DELAY_MS)
      : 700,
};
