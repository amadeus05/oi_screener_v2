import fs from 'node:fs';
import path from 'node:path';
import { SignalChartRenderer } from '../application/chart/signal-chart-renderer';
import { MarketCandle } from '../domain/market/exchange-market-data-provider.interface';

// Test data with known values for verification
function createTestCandles(): MarketCandle[] {
  const candles: MarketCandle[] = [];
  const basePrice = 0.2950;
  const now = new Date('2024-03-15T14:00:00Z');

  // Create candles with predictable pattern
  for (let i = 0; i < 20; i++) {
    const offset = i * 0.001;
    const volatility = (i % 3 === 0) ? 0.0005 : 0.0002;

    const open = basePrice + offset + (Math.random() - 0.5) * 0.0003;
    const close = open + (i > 15 ? 0.002 : (Math.random() - 0.4) * 0.0004); // Uptrend at end
    const high = Math.max(open, close) + volatility;
    const low = Math.min(open, close) - volatility;

    candles.push({
      symbol: 'TESTUSDT',
      openTime: new Date(now.getTime() + i * 60000),
      closeTime: new Date(now.getTime() + (i + 1) * 60000),
      open,
      high,
      low,
      close,
      volume: 100000 + i * 1000,
    });
  }

  return candles;
}

function verifyChartRendering(): boolean {
  console.log('=== Chart Rendering Verification ===\n');

  const candles = createTestCandles();
  const renderer = new SignalChartRenderer();

  // Generate SVG
  const svg = renderer.renderSvg({
    exchange: 'Binance',
    symbol: 'TESTUSDT',
    direction: 'LONG',
    signalNumber: 42,
    candles,
  });

  // Extract key information from SVG
  const checks = [
    { name: 'SVG declaration', test: svg.includes('<svg xmlns="http://www.w3.org/2000/svg"') },
    { name: 'Background color #131722', test: svg.includes('fill="#131722"') },
    { name: 'Grid color #2a2e39', test: svg.includes('stroke="#2a2e39"') },
    { name: 'Bull candle color #22ab94', test: svg.includes('fill="#22ab94"') || svg.includes('stroke="#22ab94"') },
    { name: 'Bear candle color #f7525f', test: svg.includes('fill="#f7525f"') || svg.includes('stroke="#f7525f"') },
    { name: 'Chart area clip path', test: svg.includes('clip-path="url(#chartArea)"') },
    { name: 'Header text', test: svg.includes('Binance TESTUSDT') },
    { name: 'Direction indicator', test: svg.includes('LONG #42') },
    { name: 'Price axis labels', test: svg.includes('text-anchor="start"') && svg.includes('font-size="11"') },
    { name: 'Time axis labels', test: svg.includes('text-anchor="middle"') && svg.includes(':') },
    { name: 'Current price badge', test: svg.includes('rx="2"') && svg.includes('width="64"') && svg.includes('height="20"') },
    { name: 'Dashed price line', test: svg.includes('stroke-dasharray="4 4"') },
    { name: 'Horizontal grid lines', test: (svg.match(/stroke-dasharray="2 2"/g) || []).length >= 6 },
    { name: 'Candle wicks (lines)', test: (svg.match(/<line x1=/g) || []).length >= candles.length },
    { name: 'Candle bodies (rects)', test: (svg.match(/<rect x=/g) || []).length >= candles.length },
  ];

  let passed = 0;
  let failed = 0;

  checks.forEach(check => {
    const status = check.test ? '✓' : '✗';
    const color = check.test ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';
    console.log(`${color}${status}${reset} ${check.name}`);
    if (check.test) passed++; else failed++;
  });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  // Count elements
  const candleWicks = (svg.match(/<line x1=.*?stroke-width="1"/g) || []).length;
  const candleBodies = (svg.match(/<rect x=.*?fill="#(22ab94|f7525f)"/g) || []).length;
  const gridLines = (svg.match(/stroke-dasharray="2 2"/g) || []).length;

  console.log('\n=== Element Counts ===');
  console.log(`Candle wicks: ${candleWicks} (expected: ${candles.length})`);
  console.log(`Candle bodies: ${candleBodies} (expected: ${candles.length})`);
  console.log(`Grid lines: ${gridLines}`);

  // Verify coordinate bounds
  const viewBoxMatch = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (viewBoxMatch) {
    const width = parseInt(viewBoxMatch[1]);
    const height = parseInt(viewBoxMatch[2]);
    console.log(`\n=== Canvas Dimensions ===`);
    console.log(`Width: ${width}px, Height: ${height}px`);

    // Check all coordinates are within bounds
    const allX = svg.match(/x="([\d.]+)"/g) || [];
    const allY = svg.match(/y="([\d.]+)"/g) || [];

    const xValues = allX.map(m => parseFloat(m.replace('x="', '').replace('"', '')));
    const yValues = allY.map(m => parseFloat(m.replace('y="', '').replace('"', '')));

    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);

    console.log(`Coordinate bounds: X[${minX.toFixed(1)}, ${maxX.toFixed(1)}], Y[${minY.toFixed(1)}, ${maxY.toFixed(1)}]`);

    if (minX < 0 || maxX > width || minY < 0 || maxY > height) {
      console.log('\x1b[31m✗ WARNING: Some coordinates are outside canvas bounds!\x1b[0m');
    } else {
      console.log('\x1b[32m✓ All coordinates within canvas bounds\x1b[0m');
    }
  }

  // Save test output
  const outputDir = path.resolve('tmp');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'verification-chart.svg'), svg);
  console.log(`\nTest SVG saved to: tmp/verification-chart.svg`);

  return failed === 0;
}

// Run verification
const success = verifyChartRendering();
process.exit(success ? 0 : 1);
