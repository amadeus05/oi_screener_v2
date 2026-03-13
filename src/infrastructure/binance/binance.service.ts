import { injectable } from 'inversify';
import {
  BinanceCurrentOpenInterestResponse,
  BinanceFuturesExchangeInfoResponse,
  BinanceFuturesKlineResponse,
  BinanceOpenInterestHistResponseItem,
  BinanceTakerBuySellVolumeResponseItem,
} from './binance.types';

export type BinanceHttpClient = typeof fetch;
type BinanceErrorPayload = {
  code?: number;
  msg?: string;
  retryAfter?: number;
};

@injectable()
export class BinanceService {
  private readonly baseUrl: string;
  private readonly maxRateLimitRetries = 5;
  private readonly baseRetryDelayMs = 1_000;
  private readonly maxRetryDelayMs = 60_000;

  public constructor(
    private readonly httpClient: BinanceHttpClient = fetch,
    baseUrl = 'https://fapi.binance.com',
  ) {
    this.baseUrl = baseUrl;
  }

  public async getUsdMExchangeInfo(): Promise<BinanceFuturesExchangeInfoResponse> {
    return this.getJson<BinanceFuturesExchangeInfoResponse>('/fapi/v1/exchangeInfo');
  }

  public async getOpenInterest(symbol: string): Promise<BinanceCurrentOpenInterestResponse> {
    return this.getJson<BinanceCurrentOpenInterestResponse>('/fapi/v1/openInterest', {
      symbol,
    });
  }

  public async getRecent1mKlines(
    symbol: string,
    limit: number,
  ): Promise<BinanceFuturesKlineResponse[]> {
    return this.getJson<BinanceFuturesKlineResponse[]>('/fapi/v1/klines', {
      symbol,
      interval: '1m',
      limit: String(limit),
    });
  }

  public async getOpenInterestHistory(
    symbol: string,
    limit: number,
    period: BinanceDataPeriod = '5m',
  ): Promise<BinanceOpenInterestHistResponseItem[]> {
    return this.getJson<BinanceOpenInterestHistResponseItem[]>(
      '/futures/data/openInterestHist',
      {
        symbol,
        period,
        limit: String(limit),
      },
    );
  }

  public async getTakerBuySellVolume(
    symbol: string,
    limit: number,
    period: BinanceDataPeriod = '5m',
  ): Promise<BinanceTakerBuySellVolumeResponseItem[]> {
    return this.getJson<BinanceTakerBuySellVolumeResponseItem[]>(
      '/futures/data/takerlongshortRatio',
      {
        symbol,
        period,
        limit: String(limit),
      },
    );
  }

  private async getJson<T>(
    path: string,
    params?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    return this.fetchJsonWithRetry<T>(url.toString(), 0);
  }

  private async fetchJsonWithRetry<T>(
    url: string,
    attempt: number,
  ): Promise<T> {
    const response = await this.httpClient(url);

    if (response.ok) {
      return (await response.json()) as T;
    }

    const errorPayload = await this.tryReadErrorPayload(response);
    const shouldRetry = this.shouldRetry(response.status, errorPayload);

    if (shouldRetry && attempt < this.maxRateLimitRetries) {
      const delayMs = this.resolveRetryDelayMs(response, errorPayload, attempt);
      console.warn(
        `[binance] rate limit protection triggered: status=${response.status} retryInMs=${delayMs} attempt=${attempt + 1} url=${url}`,
      );
      await this.delay(delayMs);
      return this.fetchJsonWithRetry<T>(url, attempt + 1);
    }

    throw new Error(
      `Binance request failed: ${response.status} ${response.statusText} for ${url}` +
        (errorPayload?.msg ? ` | ${errorPayload.msg}` : ''),
    );
  }

  private shouldRetry(
    status: number,
    errorPayload: BinanceErrorPayload | null,
  ): boolean {
    if (status === 429 || status === 418) {
      return true;
    }

    // User mentioned 419; Binance usually uses 429/418, but treat 419 defensively.
    if (status === 419) {
      return true;
    }

    if (errorPayload?.code === -1003) {
      return true;
    }

    return false;
  }

  private resolveRetryDelayMs(
    response: Response,
    errorPayload: BinanceErrorPayload | null,
    attempt: number,
  ): number {
    const retryAfterHeader = response.headers.get('retry-after');

    if (retryAfterHeader) {
      const parsedSeconds = Number(retryAfterHeader);

      if (Number.isFinite(parsedSeconds) && parsedSeconds > 0) {
        return Math.min(parsedSeconds * 1000, this.maxRetryDelayMs);
      }
    }

    if (
      errorPayload?.retryAfter !== undefined &&
      Number.isFinite(errorPayload.retryAfter) &&
      errorPayload.retryAfter > 0
    ) {
      return Math.min(Number(errorPayload.retryAfter), this.maxRetryDelayMs);
    }

    const exponential = Math.min(
      this.baseRetryDelayMs * 2 ** attempt,
      this.maxRetryDelayMs,
    );
    const jitter = Math.floor(Math.random() * 500);
    return exponential + jitter;
  }

  private async tryReadErrorPayload(
    response: Response,
  ): Promise<BinanceErrorPayload | null> {
    try {
      return (await response.json()) as BinanceErrorPayload;
    } catch {
      return null;
    }
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  }
}

export type BinanceDataPeriod =
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '6h'
  | '12h'
  | '1d';
