export type BybitListResponse<TItem> = {
  retCode: number;
  retMsg: string;
  result: {
    category?: string;
    nextPageCursor?: string;
    list: TItem[];
  };
  time: number;
};

export type BybitLinearInstrument = {
  symbol: string;
  status: string;
  quoteCoin: string;
  contractType: string;
};

