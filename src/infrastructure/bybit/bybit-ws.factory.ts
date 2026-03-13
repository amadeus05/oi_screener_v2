import { injectable } from 'inversify';
import WebSocket from 'ws';
import {
  WebSocketFactory,
  WebSocketLike,
} from '../binance/binance-websocket-manager';

@injectable()
export class BybitWsFactory {
  public create: WebSocketFactory = (url: string): WebSocketLike =>
    new WebSocket(url) as unknown as WebSocketLike;
}

