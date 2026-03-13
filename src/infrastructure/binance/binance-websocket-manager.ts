import { injectable } from 'inversify';
import { MarketSubscription } from '../../domain/market/exchange-market-data-provider.interface';

export type WebSocketLike = {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void | Promise<void>) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  close(): void;
  readyState: number;
};

export const WEB_SOCKET_READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
} as const;

export type WebSocketFactory = (url: string) => WebSocketLike;

export type BinanceWebSocketManagerOptions = {
  baseUrl: string;
  maxStreamsPerConnection: number;
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
  forcedReconnectAfterMs: number;
};

@injectable()
export class BinanceWebSocketManager {
  public constructor(
    private readonly createWebSocket: WebSocketFactory = (url) =>
      new WebSocket(url) as unknown as WebSocketLike,
    private readonly options: BinanceWebSocketManagerOptions = {
      baseUrl: 'wss://fstream.binance.com',
      maxStreamsPerConnection: 200,
      reconnectBaseDelayMs: 1_000,
      reconnectMaxDelayMs: 30_000,
      forcedReconnectAfterMs: 23 * 60 * 60 * 1000,
    },
  ) {}

  public async subscribe<TPayload>(
    streams: string[],
    onMessage: (payload: TPayload) => Promise<void> | void,
  ): Promise<MarketSubscription> {
    const chunks = this.chunkStreams(streams);
    const subscriptions = await Promise.all(
      chunks.map((chunk) => this.createChunkSubscription(chunk, onMessage)),
    );

    return {
      close: async () => {
        await Promise.all(subscriptions.map((subscription) => subscription.close()));
      },
    };
  }

  private async createChunkSubscription<TPayload>(
    streams: string[],
    onMessage: (payload: TPayload) => Promise<void> | void,
  ): Promise<MarketSubscription> {
    let socket: WebSocketLike | null = null;
    let isClosed = false;
    let reconnectAttempts = 0;
    let forcedReconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isReconnectScheduled = false;

    const clearForcedReconnect = () => {
      if (forcedReconnectTimeout) {
        clearTimeout(forcedReconnectTimeout);
        forcedReconnectTimeout = null;
      }
    };

    const closeSocket = () => {
      if (!socket) {
        return;
      }

      const currentSocket = socket;
      socket = null;
      currentSocket.onopen = null;
      currentSocket.onmessage = null;
      currentSocket.onerror = null;
      currentSocket.onclose = null;

      if (
        currentSocket.readyState === WEB_SOCKET_READY_STATE.OPEN ||
        currentSocket.readyState === WEB_SOCKET_READY_STATE.CONNECTING
      ) {
        currentSocket.close();
      }
    };

    const scheduleReconnect = () => {
      if (isClosed || isReconnectScheduled) {
        return;
      }

      isReconnectScheduled = true;
      clearForcedReconnect();
      closeSocket();

      const delay = this.getReconnectDelay(reconnectAttempts);
      reconnectAttempts += 1;

      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        isReconnectScheduled = false;
        connect();
      }, delay);
    };

    const connect = () => {
      if (isClosed) {
        return;
      }

      const url = `${this.options.baseUrl}/stream?streams=${streams.join('/')}`;
      socket = this.createWebSocket(url);

      socket.onopen = () => {
        reconnectAttempts = 0;
        clearForcedReconnect();
        forcedReconnectTimeout = setTimeout(
          () => scheduleReconnect(),
          this.options.forcedReconnectAfterMs,
        );
      };

      socket.onmessage = async (event) => {
        const payload = JSON.parse(String(event.data)) as { data: TPayload };
        await onMessage(payload.data);
      };

      socket.onerror = () => {
        scheduleReconnect();
      };

      socket.onclose = () => {
        scheduleReconnect();
      };
    };

    connect();

    return {
      close: async () => {
        isClosed = true;

        clearForcedReconnect();

        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
        }

        closeSocket();
      },
    };
  }

  private getReconnectDelay(attempt: number): number {
    const exponentialDelay = Math.min(
      this.options.reconnectBaseDelayMs * 2 ** attempt,
      this.options.reconnectMaxDelayMs,
    );

    const jitter = Math.floor(Math.random() * 500);
    return exponentialDelay + jitter;
  }

  private chunkStreams(streams: string[]): string[][] {
    const chunks: string[][] = [];

    for (let index = 0; index < streams.length; index += this.options.maxStreamsPerConnection) {
      chunks.push(streams.slice(index, index + this.options.maxStreamsPerConnection));
    }

    return chunks;
  }
}
