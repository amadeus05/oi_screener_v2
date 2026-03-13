import { injectable } from 'inversify';
import { MarketSubscription } from '../../domain/market/exchange-market-data-provider.interface';
import {
  WEB_SOCKET_READY_STATE,
  WebSocketFactory,
  WebSocketLike,
} from '../binance/binance-websocket-manager';

export type BybitWebSocketManagerOptions = {
  baseUrl: string;
  maxTopicsPerConnection: number;
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
  forcedReconnectAfterMs: number;
  pingIntervalMs: number;
};

export type BybitMessageEnvelope<TPayload> = {
  topic?: string;
  data?: TPayload;
  ts?: number;
  success?: boolean;
  ret_msg?: string;
  op?: string;
  type?: string;
};

@injectable()
export class BybitWebSocketManager {
  public constructor(
    private readonly createWebSocket: WebSocketFactory = (url) =>
      new WebSocket(url) as unknown as WebSocketLike,
    private readonly options: BybitWebSocketManagerOptions = {
      baseUrl: 'wss://stream.bybit.com/v5/public/linear',
      maxTopicsPerConnection: 200,
      reconnectBaseDelayMs: 1_000,
      reconnectMaxDelayMs: 30_000,
      forcedReconnectAfterMs: 23 * 60 * 60 * 1000,
      pingIntervalMs: 20_000,
    },
  ) {}

  public async subscribe<TPayload>(
    topics: string[],
    onMessage: (payload: TPayload) => Promise<void> | void,
  ): Promise<MarketSubscription> {
    const chunks = this.chunkTopics(topics);
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
    topics: string[],
    onMessage: (payload: TPayload) => Promise<void> | void,
  ): Promise<MarketSubscription> {
    let socket: WebSocketLike | null = null;
    let isClosed = false;
    let reconnectAttempts = 0;
    let forcedReconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let isReconnectScheduled = false;

    const clearTimers = () => {
      if (forcedReconnectTimeout) {
        clearTimeout(forcedReconnectTimeout);
        forcedReconnectTimeout = null;
      }

      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
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
      clearTimers();
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

      socket = this.createWebSocket(this.options.baseUrl);

      socket.onopen = () => {
        reconnectAttempts = 0;
        this.sendJson(socket, { op: 'subscribe', args: topics });
        pingInterval = setInterval(() => {
          this.sendJson(socket, { op: 'ping' });
        }, this.options.pingIntervalMs);
        forcedReconnectTimeout = setTimeout(
          () => scheduleReconnect(),
          this.options.forcedReconnectAfterMs,
        );
      };

      socket.onmessage = async (event) => {
        const envelope = JSON.parse(String(event.data)) as BybitMessageEnvelope<TPayload>;

        if (!envelope.topic || envelope.data === undefined) {
          return;
        }

        await onMessage(envelope as TPayload);
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
        clearTimers();
        closeSocket();
      },
    };
  }

  private sendJson(socket: WebSocketLike | null, payload: unknown): void {
    if (!socket || socket.readyState !== WEB_SOCKET_READY_STATE.OPEN) {
      return;
    }

    const socketWithSend = socket as WebSocketLike & { send?: (value: string) => void };
    socketWithSend.send?.(JSON.stringify(payload));
  }

  private getReconnectDelay(attempt: number): number {
    const exponentialDelay = Math.min(
      this.options.reconnectBaseDelayMs * 2 ** attempt,
      this.options.reconnectMaxDelayMs,
    );

    const jitter = Math.floor(Math.random() * 500);
    return exponentialDelay + jitter;
  }

  private chunkTopics(topics: string[]): string[][] {
    const chunks: string[][] = [];

    for (let index = 0; index < topics.length; index += this.options.maxTopicsPerConnection) {
      chunks.push(topics.slice(index, index + this.options.maxTopicsPerConnection));
    }

    return chunks;
  }
}
