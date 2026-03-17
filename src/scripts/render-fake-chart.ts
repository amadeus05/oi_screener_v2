import fs from 'node:fs';
import path from 'node:path';
import { SignalChartRenderer } from '../application/chart/signal-chart-renderer';
import {
  MarketCandle,
  MinuteTradeDelta,
  OpenInterestPoint,
} from '../domain/market/exchange-market-data-provider.interface';

function createFakeCandles(count: number): MarketCandle[] {
  const candles: MarketCandle[] = [];
  let price = 1.42;
  const start = Date.now() - count * 60_000;

  for (let index = 0; index < count; index += 1) {
    const open = price;
    const drift = (Math.random() - 0.48) * 0.025 + (index > count - 10 ? 0.035 : 0);
    const close = Math.max(0.2, open * (1 + drift));
    const high = Math.max(open, close) * (1 + Math.random() * 0.018);
    const low = Math.min(open, close) * (1 - Math.random() * 0.018);
    const volume = 400_000 + Math.random() * 250_000 + (index > count - 8 ? 1_400_000 : 0);
    const openTime = new Date(start + index * 60_000);
    const closeTime = new Date(openTime.getTime() + 60_000);

    candles.push({
      symbol: 'ARPAUSDT',
      openTime,
      closeTime,
      open,
      high,
      low,
      close,
      volume,
    });

    price = close;
  }

  return candles;
}

function createFakeOi(candles: MarketCandle[]): OpenInterestPoint[] {
  let oi = 24_000_000;

  return candles.map((candle, index) => {
    oi += (Math.random() - 0.42) * 240_000 + (index > candles.length - 9 ? 680_000 : 0);

    return {
      symbol: candle.symbol,
      timestamp: candle.closeTime,
      openInterest: oi,
    };
  });
}

function createFakeDelta(candles: MarketCandle[]): MinuteTradeDelta[] {
  return candles.map((candle, index) => {
    const ratio = Math.max(-0.8, Math.min(0.95, (Math.random() - 0.35) * 0.7 + (index > candles.length - 8 ? 0.28 : 0)));
    const total = candle.volume * candle.close;
    const buy = ((ratio + 1) / 2) * total;
    const sell = total - buy;

    return {
      symbol: candle.symbol,
      minuteStart: candle.openTime,
      minuteClose: candle.closeTime,
      marketBuyBaseVolume: buy / candle.close,
      marketSellBaseVolume: sell / candle.close,
      marketBuyNotional: buy,
      marketSellNotional: sell,
      deltaNotional: buy - sell,
      deltaRatio: ratio,
    };
  });
}

async function main(): Promise<void> {
  const candles = createFakeCandles(60);
  const oi = createFakeOi(candles);
  const delta = createFakeDelta(candles);
  const renderer = new SignalChartRenderer();

  // Generate SVG with all panels
  const svg = renderer.renderSvg({
    exchange: 'Binance',
    symbol: 'ARPAUSDT',
    direction: 'LONG',
    signalNumber: 2,
    candles,
    openInterestPoints: oi,
    minuteTradeDeltas: delta,
    width: 900,
    height: 650,
  });

  const outputDir = path.resolve('tmp');
  fs.mkdirSync(outputDir, { recursive: true });

  // Save SVG
  const svgPath = path.join(outputDir, 'chart-with-oi-delta.svg');
  fs.writeFileSync(svgPath, svg);
  console.log(`SVG generated: ${svgPath}`);

  // Generate and save PNG
  const pngBuffer = await renderer.renderPngBuffer({
    exchange: 'Binance',
    symbol: 'ARPAUSDT',
    direction: 'LONG',
    signalNumber: 2,
    candles,
    openInterestPoints: oi,
    minuteTradeDeltas: delta,
    width: 900,
    height: 650,
  });

  const pngPath = path.join(outputDir, 'chart-with-oi-delta.png');
  fs.writeFileSync(pngPath, pngBuffer);
  console.log(`PNG generated: ${pngPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
