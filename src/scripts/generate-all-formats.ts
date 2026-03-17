import fs from 'node:fs';
import path from 'node:path';
import { SignalChartRenderer } from '../application/chart/signal-chart-renderer';
import { MarketCandle } from '../domain/market/exchange-market-data-provider.interface';

// Create 60 candles matching the pattern in the original image
function createCandlesLikeImage(): MarketCandle[] {
  const candles: MarketCandle[] = [];
  // Start around 0.2930 as in the image
  let price = 0.2930;
  const now = Date.now();
  const start = now - 60 * 60_000;

  // Create pattern similar to the user's image:
  // - Initial range 0.2935-0.2940
  // - Drop to 0.2920-0.2925
  // - Recovery up to 0.2950

  for (let i = 0; i < 60; i++) {
    let trend = 0;

    if (i < 15) {
      // Sideways around 0.2940
      trend = (Math.random() - 0.5) * 0.001;
    } else if (i < 30) {
      // Drop to 0.2920
      trend = -0.00015 + (Math.random() - 0.5) * 0.0005;
    } else if (i < 40) {
      // Bottom consolidation
      trend = (Math.random() - 0.5) * 0.001;
    } else {
      // Uptrend to 0.2950+
      trend = 0.0002 + (Math.random() - 0.5) * 0.0003;
    }

    const open = price;
    const close = Math.max(0.29, open * (1 + trend));
    const high = Math.max(open, close) * (1 + Math.random() * 0.0015);
    const low = Math.min(open, close) * (1 - Math.random() * 0.0015);

    candles.push({
      symbol: 'ARPAUSDT',
      openTime: new Date(start + i * 60_000),
      closeTime: new Date(start + (i + 1) * 60_000),
      open,
      high,
      low,
      close,
      volume: 80000 + Math.random() * 50000,
    });
    price = close;
  }

  return candles;
}

async function main(): Promise<void> {
  const candles = createCandlesLikeImage();
  const renderer = new SignalChartRenderer();
  const outputDir = path.resolve('tmp');
  fs.mkdirSync(outputDir, { recursive: true });

  console.log('=== Generating TradingView-style charts ===\n');

  // Standard size matching user's image
  const configs = [
    { width: 900, height: 500, name: 'tradingview-final' },
    { width: 1200, height: 600, name: 'tradingview-hd' },
  ];

  for (const config of configs) {
    console.log(`Generating ${config.name} (${config.width}x${config.height})...`);

    // SVG
    const svg = renderer.renderSvg({
      exchange: 'Binance',
      symbol: 'ARPAUSDT',
      direction: 'LONG',
      signalNumber: 1,
      candles,
      width: config.width,
      height: config.height,
    });
    fs.writeFileSync(path.join(outputDir, `${config.name}.svg`), svg);

    // PNG
    const png = await renderer.renderPngBuffer({
      exchange: 'Binance',
      symbol: 'ARPAUSDT',
      direction: 'LONG',
      signalNumber: 1,
      candles,
      width: config.width,
      height: config.height,
    });
    fs.writeFileSync(path.join(outputDir, `${config.name}.png`), png);

    // File sizes
    const svgStats = fs.statSync(path.join(outputDir, `${config.name}.svg`));
    const pngStats = fs.statSync(path.join(outputDir, `${config.name}.png`));

    console.log(`  SVG: ${(svgStats.size / 1024).toFixed(1)} KB`);
    console.log(`  PNG: ${(pngStats.size / 1024).toFixed(1)} KB`);
    console.log('');
  }

  // Print price range info
  const prices = candles.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close }));
  const allPrices = prices.flatMap(p => [p.open, p.high, p.low, p.close]);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);

  console.log('=== Price Range ===');
  console.log(`Min: ${minPrice.toFixed(4)}`);
  console.log(`Max: ${maxPrice.toFixed(4)}`);
  console.log(`Range: ${(maxPrice - minPrice).toFixed(4)}`);

  console.log('\nAll files saved to tmp/');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
