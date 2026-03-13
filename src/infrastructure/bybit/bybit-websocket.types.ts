export type BybitKlineMessage = {
  topic: string;
  type: 'snapshot' | 'delta';
  ts: number;
  data: Array<{
    start: number;
    end: number;
    interval: string;
    open: string;
    close: string;
    high: string;
    low: string;
    volume: string;
    turnover: string;
    confirm: boolean;
    timestamp: number;
  }>;
};

export type BybitTradeMessage = {
  topic: string;
  type: 'snapshot' | 'delta';
  ts: number;
  data: Array<{
    T: number;
    s: string;
    S: 'Buy' | 'Sell';
    v: string;
    p: string;
    i: string;
  }>;
};

export type BybitTickerData = {
  symbol: string;
  openInterest?: string;
};

export type BybitTickerMessage = {
  topic: string;
  type: 'snapshot' | 'delta';
  cs?: number;
  ts: number;
  data: BybitTickerData | BybitTickerData[];
};

export type BybitControlMessage = {
  success?: boolean;
  ret_msg?: string;
  op?: string;
  req_id?: string;
  type?: string;
};

