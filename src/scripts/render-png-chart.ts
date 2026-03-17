import fs from 'node:fs';
import path from 'node:path';
import { SignalChartRenderer } from '../application/chart/signal-chart-renderer';
import { MarketCandle } from '../domain/market/exchange-market-data-provider.interface';

function createFakeCandles(count: number): MarketCandle[] {
  const candles: MarketCandle[] = [];
  let price = 0.2930;
  const start = Date.now() - count * 60_000;

  for (let i = 0; i < count; i++) {
    const open = price;
    // Add some trend at the end for visual interest
    const drift = (Math.random() - 0.5) * 0.008 + (i > count - 15 ? 0.015 : 0);
    const close = Math.max(0.2, open * (1 + drift));
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);

    candles.push({
      symbol: 'ARPAUSDT',
      openTime: new Date(start + i * 60_000),
      closeTime: new Date(start + i * 60_000 + 60_000),
      open,
      high,
      low,
      close,
      volume: 100000,
    });
    price = close;
  }
  return candles;
}

async function main(): Promise<void> {
  const candles = createFakeCandles(60);
  const renderer = new SignalChartRenderer();

  // Generate PNG
  const pngBuffer = await renderer.renderPngBuffer({
    exchange: 'Binance',
    symbol: 'ARPAUSDT',
    direction: 'LONG',
    signalNumber: 1,
    candles,
  });

  const outputDir = path.resolve('tmp');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'tradingview-chart.png');
  fs.writeFileSync(outputPath, pngBuffer);
  console.log(`PNG generated: ${outputPath}`);

  // Also save SVG for reference
  const svg = renderer.renderSvg({
    exchange: 'Binance',
    symbol: 'ARPAUSDT',
    direction: 'LONG',
    signalNumber: 1,
    candles,
  });
  fs.writeFileSync(path.join(outputDir, 'tradingview-chart.svg'), svg);
  console.log(`SVG saved: ${path.join(outputDir, 'tradingview-chart.svg')}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
