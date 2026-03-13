import { injectable } from 'inversify';
import WebSocket from 'ws';
import {
  WebSocketFactory,
  WebSocketLike,
} from './binance-websocket-manager';

@injectable()
export class BinanceWsFactory {
  public create: WebSocketFactory = (url: string): WebSocketLike =>
    new WebSocket(url) as unknown as WebSocketLike;
}
