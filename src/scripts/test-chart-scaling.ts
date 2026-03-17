import fs from 'node:fs';
import path from 'node:path';
import { SignalChartRenderer } from '../application/chart/signal-chart-renderer';
import { MarketCandle } from '../domain/market/exchange-market-data-provider.interface';

// Create 60 candles like in real usage
function create60Candles(): MarketCandle[] {
  const candles: MarketCandle[] = [];
  let price = 0.2930;
  const start = Date.now() - 60 * 60_000; // 60 minutes ago

  for (let i = 0; i < 60; i++) {
    const open = price;
    // Add uptrend at the end for LONG signal
    const drift = (Math.random() - 0.5) * 0.003 + (i > 45 ? 0.008 : 0);
    const close = Math.max(0.2, open * (1 + drift));
    const high = Math.max(open, close) * (1 + Math.random() * 0.002);
    const low = Math.min(open, close) * (1 - Math.random() * 0.002);

    candles.push({
      symbol: 'ARPAUSDT',
      openTime: new Date(start + i * 60_000),
      closeTime: new Date(start + (i + 1) * 60_000),
      open,
      high,
      low,
      close,
      volume: 50000 + Math.random() * 100000,
    });
    price = close;
  }

  return candles;
}

async function testScaling(): Promise<void> {
  const candles = create60Candles();
  const renderer = new SignalChartRenderer();
  const outputDir = path.resolve('tmp');
  fs.mkdirSync(outputDir, { recursive: true });

  // Test different sizes
  const sizes = [
    { width: 900, height: 500, name: 'standard' },
    { width: 1200, height: 600, name: 'large' },
    { width: 600, height: 400, name: 'compact' },
  ];

  for (const size of sizes) {
    console.log(`\n=== Testing ${size.name} (${size.width}x${size.height}) ===`);

    const svg = renderer.renderSvg({
      exchange: 'Binance',
      symbol: 'ARPAUSDT',
      direction: 'LONG',
      signalNumber: 1,
      candles,
      width: size.width,
      height: size.height,
    });

    // Verify viewBox matches requested size
    const viewBoxMatch = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    const widthMatch = svg.match(/width="(\d+)"/);
    const heightMatch = svg.match(/height="(\d+)"/);

    if (viewBoxMatch && widthMatch && heightMatch) {
      const vbWidth = parseInt(viewBoxMatch[1]);
      const vbHeight = parseInt(viewBoxMatch[2]);
      const svgWidth = parseInt(widthMatch[1]);
      const svgHeight = parseInt(heightMatch[1]);

      console.log(`  viewBox: ${vbWidth}x${vbHeight}`);
      console.log(`  Dimensions: ${svgWidth}x${svgHeight}`);

      if (vbWidth === size.width && vbHeight === size.height) {
        console.log('  ✓ Dimensions match request');
      } else {
        console.log('  ✗ Dimensions mismatch!');
      }
    }

    // Count candles
    const candleCount = (svg.match(/stroke-width="1"/g) || []).length;
    const bodyCount = (svg.match(/fill="#(22ab94|f7525f)"/g) || []).length;
    console.log(`  Candle wicks: ~${candleCount}, bodies: ~${bodyCount}`);

    // Check chart area clip path exists
    const hasClipPath = svg.includes('clip-path="url(#chartArea)"');
    console.log(`  ${hasClipPath ? '✓' : '✗'} Clip path exists`);

    // Check current price elements
    const hasPriceBadge = svg.includes('width="64"') && svg.includes('height="20"');
    const hasPriceLine = svg.includes('stroke-dasharray="4 4"');
    console.log(`  ${hasPriceBadge ? '✓' : '✗'} Price badge`);
    console.log(`  ${hasPriceLine ? '✓' : '✗'} Price line`);

    // Save SVG
    fs.writeFileSync(path.join(outputDir, `chart-${size.name}.svg`), svg);
  }

  console.log('\n=== All tests completed ===');
  console.log('Files saved to tmp/');
}

testScaling().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
