import { injectable } from 'inversify';
import {
  BybitLinearInstrument,
  BybitListResponse,
} from './bybit.types';

export type BybitHttpClient = typeof fetch;

type BybitErrorPayload = {
  retCode?: number;
  retMsg?: string;
};

@injectable()
export class BybitService {
  private readonly maxRateLimitRetries = 5;
  private readonly baseRetryDelayMs = 1_000;
  private readonly maxRetryDelayMs = 60_000;

  public constructor(
    private readonly httpClient: BybitHttpClient = fetch,
    private readonly baseUrl = 'https://api.bybit.com',
  ) {}

  public async getLinearInstruments(): Promise<BybitLinearInstrument[]> {
    const instruments: BybitLinearInstrument[] = [];
    let cursor: string | null = null;

    do {
      const response: BybitListResponse<BybitLinearInstrument> =
        await this.getJson<BybitListResponse<BybitLinearInstrument>>(
        '/v5/market/instruments-info',
        {
          category: 'linear',
          limit: '1000',
          ...(cursor ? { cursor } : {}),
        },
      );

      instruments.push(...response.result.list);
      cursor = response.result.nextPageCursor || null;
    } while (cursor);

    return instruments;
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
      const payload = (await response.json()) as T & BybitErrorPayload;

      if ('retCode' in payload && payload.retCode !== undefined && payload.retCode !== 0) {
        throw new Error(`Bybit request failed: ${payload.retCode} ${payload.retMsg ?? 'Unknown error'} for ${url}`);
      }

      return payload;
    }

    if (response.status === 429 && attempt < this.maxRateLimitRetries) {
      const delayMs = Math.min(
        this.baseRetryDelayMs * 2 ** attempt + Math.floor(Math.random() * 500),
        this.maxRetryDelayMs,
      );
      console.warn(
        `[bybit] rate limit protection triggered: status=${response.status} retryInMs=${delayMs} attempt=${attempt + 1} url=${url}`,
      );
      await this.delay(delayMs);
      return this.fetchJsonWithRetry<T>(url, attempt + 1);
    }

    throw new Error(`Bybit request failed: ${response.status} ${response.statusText} for ${url}`);
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  }
}
