import { Resvg } from '@resvg/resvg-js';
import {
  MarketCandle,
  MinuteTradeDelta,
  OpenInterestPoint,
} from '../../domain/market/exchange-market-data-provider.interface';

export type SignalChartRenderInput = {
  exchange: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  signalNumber: number;
  candles: MarketCandle[];
  openInterestPoints?: OpenInterestPoint[];
  minuteTradeDeltas?: MinuteTradeDelta[];
  width?: number;
  height?: number;
};

type Point = { x: number; y: number };

// TradingView colors
const TV_COLORS = {
  background: '#131722',
  grid: '#2a2e39',
  gridText: '#787b86',
  bullBody: '#22ab94',
  bullWick: '#22ab94',
  bearBody: '#f7525f',
  bearWick: '#f7525f',
  oiLine: '#2962ff',      // Blue for OI
  deltaLine: '#ffffff',   // White line for delta
  currentPriceBgLong: '#22ab94',
  currentPriceBgShort: '#f7525f',
  currentPriceText: '#ffffff',
  border: '#2a2e39',
  panelSeparator: '#2a2e39',
};

export class SignalChartRenderer {
  public async renderSvgBuffer(input: SignalChartRenderInput): Promise<Buffer> {
    const svg = this.renderSvg(input);
    return Buffer.from(svg);
  }

  public async renderPngBuffer(input: SignalChartRenderInput): Promise<Buffer> {
    const svg = this.renderSvg(input);
    const resvg = new Resvg(svg, {
      fitTo: {
        mode: 'width',
        value: input.width ?? 900,
      },
    });

    return resvg.render().asPng();
  }

  public renderSvg(input: SignalChartRenderInput): string {
    const width = input.width ?? 900;
    const height = input.height ?? 600; // Taller for multi-panel

    // Margins
    const margin = {
      left: 8,
      right: 72,
      top: 40,
      bottom: 32
    };

    const chartWidth = width - margin.left - margin.right;
    const totalChartHeight = height - margin.top - margin.bottom;

    // Panel heights (percentage)
    const pricePanelHeight = Math.floor(totalChartHeight * 0.55);
    const oiPanelHeight = Math.floor(totalChartHeight * 0.22);
    const deltaPanelHeight = totalChartHeight - pricePanelHeight - oiPanelHeight - 2; // 2px separators

    // Panel positions
    const priceTop = margin.top;
    const oiTop = priceTop + pricePanelHeight + 1;
    const deltaTop = oiTop + oiPanelHeight + 1;

    // Data
    const candles = input.candles.slice(-60);
    const oiPoints = (input.openInterestPoints || []).slice(-60);
    const deltas = (input.minuteTradeDeltas || []).slice(-60);
    const visibleCount = candles.length;

    if (visibleCount === 0) {
      return this.renderEmptyChart(width, height, input);
    }

    // Price scale
    const priceMin = Math.min(...candles.map((c) => c.low));
    const priceMax = Math.max(...candles.map((c) => c.high));
    const priceRange = priceMax - priceMin;
    const pricePadding = priceRange * 0.05;
    const priceScaleMin = priceMin - pricePadding;
    const priceScaleMax = priceMax + pricePadding;
    const currentPrice = candles[candles.length - 1].close;

    // OI scale
    const hasOI = oiPoints.length > 0;
    const oiMin = hasOI ? Math.min(...oiPoints.map(p => p.openInterest)) : 0;
    const oiMax = hasOI ? Math.max(...oiPoints.map(p => p.openInterest)) : 1;
    const oiPadding = (oiMax - oiMin) * 0.05;
    const oiScaleMin = oiMin - oiPadding;
    const oiScaleMax = oiMax + oiPadding;

    // Delta scale
    const hasDelta = deltas.length > 0;
    const deltaValues = hasDelta ? deltas.map(d => d.deltaRatio) : [0];
    const deltaMin = Math.min(0, ...deltaValues);
    const deltaMax = Math.max(0, ...deltaValues);
    const deltaPadding = (deltaMax - deltaMin) * 0.05 || 0.1;
    const deltaScaleMin = deltaMin - deltaPadding;
    const deltaScaleMax = deltaMax + deltaPadding;

    // Candle dimensions
    const candleWidth = Math.max(3, (chartWidth / visibleCount) * 0.6);
    const gap = chartWidth / visibleCount;

    // Build elements
    const candleElements: string[] = [];
    const oiLinePoints: Point[] = [];
    const deltaLinePoints: Point[] = [];
    const timeLabels: string[] = [];

    candles.forEach((candle, i) => {
      const x = margin.left + i * gap + gap / 2;

      // Candles
      const openY = this.scale(candle.open, priceScaleMin, priceScaleMax, priceTop + pricePanelHeight - 4, priceTop + 4);
      const closeY = this.scale(candle.close, priceScaleMin, priceScaleMax, priceTop + pricePanelHeight - 4, priceTop + 4);
      const highY = this.scale(candle.high, priceScaleMin, priceScaleMax, priceTop + pricePanelHeight - 4, priceTop + 4);
      const lowY = this.scale(candle.low, priceScaleMin, priceScaleMax, priceTop + pricePanelHeight - 4, priceTop + 4);

      const isBull = candle.close >= candle.open;
      const bodyColor = isBull ? TV_COLORS.bullBody : TV_COLORS.bearBody;
      const wickColor = isBull ? TV_COLORS.bullWick : TV_COLORS.bearWick;

      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1, Math.abs(closeY - openY));

      candleElements.push(
        `<line x1="${x}" y1="${highY}" x2="${x}" y2="${lowY}" stroke="${wickColor}" stroke-width="1" />`
      );
      candleElements.push(
        `<rect x="${x - candleWidth / 2}" y="${bodyTop}" width="${candleWidth}" height="${bodyHeight}" fill="${bodyColor}" />`
      );

      // OI line points
      if (hasOI && oiPoints[i]) {
        const oiY = this.scale(oiPoints[i].openInterest, oiScaleMin, oiScaleMax, oiTop + oiPanelHeight - 4, oiTop + 4);
        oiLinePoints.push({ x, y: oiY });
      }

      // Delta line points (white line)
      if (hasDelta && deltas[i]) {
        const deltaRatio = deltas[i].deltaRatio;
        const valueY = this.scale(deltaRatio, deltaScaleMin, deltaScaleMax, deltaTop + deltaPanelHeight - 4, deltaTop + 4);
        deltaLinePoints.push({ x, y: valueY });
      }

      // Time labels (every ~10 candles)
      if (i % 10 === 0 || i === visibleCount - 1) {
        const timeLabel = this.formatTime(candle.openTime);
        timeLabels.push(
          `<text x="${x}" y="${height - 8}" fill="${TV_COLORS.gridText}" font-size="11" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" text-anchor="middle">${timeLabel}</text>`
        );
      }
    });

    // Build OI and Delta paths
    const oiPath = this.renderSmoothPath(oiLinePoints);
    const deltaPath = this.renderSmoothPath(deltaLinePoints);

    // Grids
    const priceGrid = this.renderPanelGrid(priceTop, pricePanelHeight, chartWidth, margin.left, 5, 4);
    const oiGrid = this.renderPanelGrid(oiTop, oiPanelHeight, chartWidth, margin.left, 3, 4);
    const deltaGrid = this.renderPanelGrid(deltaTop, deltaPanelHeight, chartWidth, margin.left, 3, 4);

    // Price axis
    const currentPriceY = this.scale(currentPrice, priceScaleMin, priceScaleMax, priceTop + pricePanelHeight - 4, priceTop + 4);
    const currentPriceColor = input.direction === 'LONG' ? TV_COLORS.currentPriceBgLong : TV_COLORS.currentPriceBgShort;
    const priceLabels = this.renderPriceAxis(priceScaleMin, priceScaleMax, priceTop, pricePanelHeight, width - margin.right, currentPrice, 4);

    // OI axis labels (formatted as millions)
    const oiLabels = hasOI ? this.renderOIAxis(oiScaleMin, oiScaleMax, oiTop, oiPanelHeight, width - margin.right) : '';

    // Delta axis labels
    const deltaLabels = hasDelta ? this.renderSimpleAxis(deltaScaleMin, deltaScaleMax, deltaTop, deltaPanelHeight, width - margin.right, 2) : '';

    const header = this.renderHeader(input, margin.left, margin.top);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <clipPath id="pricePanel">
          <rect x="${margin.left}" y="${priceTop}" width="${chartWidth}" height="${pricePanelHeight}" />
        </clipPath>
        <clipPath id="oiPanel">
          <rect x="${margin.left}" y="${oiTop}" width="${chartWidth}" height="${oiPanelHeight}" />
        </clipPath>
        <clipPath id="deltaPanel">
          <rect x="${margin.left}" y="${deltaTop}" width="${chartWidth}" height="${deltaPanelHeight}" />
        </clipPath>
      </defs>

      <!-- Background -->
      <rect width="${width}" height="${height}" fill="${TV_COLORS.background}" />

      <!-- Header -->
      ${header}

      <!-- Panel separators -->
      <line x1="${margin.left}" y1="${oiTop - 1}" x2="${width - margin.right}" y2="${oiTop - 1}" stroke="${TV_COLORS.panelSeparator}" stroke-width="1" />
      <line x1="${margin.left}" y1="${deltaTop - 1}" x2="${width - margin.right}" y2="${deltaTop - 1}" stroke="${TV_COLORS.panelSeparator}" stroke-width="1" />

      <!-- Price Panel -->
      <rect x="${margin.left}" y="${priceTop}" width="${chartWidth}" height="${pricePanelHeight}" fill="none" stroke="${TV_COLORS.border}" stroke-width="1" />
      <g clip-path="url(#pricePanel)">
        ${priceGrid}
      </g>
      <line x1="${margin.left}" y1="${currentPriceY}" x2="${width - margin.right}" y2="${currentPriceY}" stroke="${currentPriceColor}" stroke-width="1" stroke-dasharray="4 4" opacity="0.6" />
      <g clip-path="url(#pricePanel)">
        ${candleElements.join('')}
      </g>

      <!-- OI Panel -->
      <rect x="${margin.left}" y="${oiTop}" width="${chartWidth}" height="${oiPanelHeight}" fill="none" stroke="${TV_COLORS.border}" stroke-width="1" />
      <g clip-path="url(#oiPanel)">
        ${oiGrid}
        ${hasOI ? `<path d="${oiPath}" fill="none" stroke="${TV_COLORS.oiLine}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />` : ''}
      </g>

      <!-- Delta Panel -->
      <rect x="${margin.left}" y="${deltaTop}" width="${chartWidth}" height="${deltaPanelHeight}" fill="none" stroke="${TV_COLORS.border}" stroke-width="1" />
      <g clip-path="url(#deltaPanel)">
        ${deltaGrid}
        <!-- Zero line for delta -->
        ${hasDelta ? `<line x1="${margin.left}" y1="${this.scale(0, deltaScaleMin, deltaScaleMax, deltaTop + deltaPanelHeight - 4, deltaTop + 4)}" x2="${width - margin.right}" y2="${this.scale(0, deltaScaleMin, deltaScaleMax, deltaTop + deltaPanelHeight - 4, deltaTop + 4)}" stroke="${TV_COLORS.grid}" stroke-width="1" stroke-dasharray="3 3" opacity="0.5" />` : ''}
        ${hasDelta ? `<path d="${deltaPath}" fill="none" stroke="${TV_COLORS.deltaLine}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />` : ''}
      </g>

      <!-- Time axis -->
      <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="${TV_COLORS.border}" stroke-width="1" />
      ${timeLabels.join('')}

      <!-- Price axis -->
      <rect x="${width - margin.right}" y="${priceTop}" width="${margin.right}" height="${pricePanelHeight}" fill="${TV_COLORS.background}" />
      <line x1="${width - margin.right}" y1="${priceTop}" x2="${width - margin.right}" y2="${priceTop + pricePanelHeight}" stroke="${TV_COLORS.border}" stroke-width="1" />
      ${priceLabels}
      <rect x="${width - margin.right + 4}" y="${currentPriceY - 10}" width="${margin.right - 8}" height="20" fill="${currentPriceColor}" rx="2" />
      <text x="${width - margin.right / 2}" y="${currentPriceY + 4}" fill="${TV_COLORS.currentPriceText}" font-size="11" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" font-weight="600" text-anchor="middle">${currentPrice.toFixed(4)}</text>

      <!-- OI axis -->
      ${hasOI ? `
      <rect x="${width - margin.right}" y="${oiTop}" width="${margin.right}" height="${oiPanelHeight}" fill="${TV_COLORS.background}" />
      <line x1="${width - margin.right}" y1="${oiTop}" x2="${width - margin.right}" y2="${oiTop + oiPanelHeight}" stroke="${TV_COLORS.border}" stroke-width="1" />
      ${oiLabels}
      ` : ''}

      <!-- Delta axis -->
      ${hasDelta ? `
      <rect x="${width - margin.right}" y="${deltaTop}" width="${margin.right}" height="${deltaPanelHeight}" fill="${TV_COLORS.background}" />
      <line x1="${width - margin.right}" y1="${deltaTop}" x2="${width - margin.right}" y2="${deltaTop + deltaPanelHeight}" stroke="${TV_COLORS.border}" stroke-width="1" />
      ${deltaLabels}
      ` : ''}
    </svg>`;
  }

  private renderHeader(input: SignalChartRenderInput, left: number, top: number): string {
    const directionColor = input.direction === 'LONG' ? TV_COLORS.bullBody : TV_COLORS.bearBody;

    return `
      <text x="${left}" y="${top - 12}" fill="#d1d4dc" font-size="14" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" font-weight="600">
        ${this.escape(input.exchange)} ${this.escape(input.symbol)}
      </text>
      <text x="${left + 120}" y="${top - 12}" fill="${directionColor}" font-size="12" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" font-weight="600">
        ${input.direction} #${input.signalNumber}
      </text>
    `;
  }

  private renderPanelGrid(top: number, height: number, width: number, left: number, horizontalLines: number, verticalLines: number): string {
    let grid = '';

    // Horizontal lines
    for (let i = 0; i <= horizontalLines; i++) {
      const y = top + (height / horizontalLines) * i;
      grid += `<line x1="${left}" y1="${y}" x2="${left + width}" y2="${y}" stroke="${TV_COLORS.grid}" stroke-width="1" stroke-dasharray="2 2" />`;
    }

    // Vertical lines
    for (let i = 0; i <= verticalLines; i++) {
      const x = left + (width / verticalLines) * i;
      grid += `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + height}" stroke="${TV_COLORS.grid}" stroke-width="1" stroke-dasharray="2 2" />`;
    }

    return grid;
  }

  private renderPriceAxis(min: number, max: number, top: number, height: number, x: number, currentPrice: number, decimals: number): string {
    const lines = 5;
    let labels = '';

    for (let i = 0; i <= lines; i++) {
      const ratio = i / lines;
      const value = max - (max - min) * ratio;
      // Add padding to stay within panel bounds (12px from top/bottom)
      const y = top + 12 + (height - 24) * ratio;

      // Skip if too close to current price
      const currentPriceY = this.scale(currentPrice, min, max, top + height, top);
      if (Math.abs(y - currentPriceY) < 15) continue;

      labels += `<text x="${x + 8}" y="${y}" fill="${TV_COLORS.gridText}" font-size="11" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" text-anchor="start">${value.toFixed(decimals)}</text>`;
    }

    return labels;
  }

  private renderSimpleAxis(min: number, max: number, top: number, height: number, x: number, decimals: number): string {
    // Use only 3 labels to avoid overlap between panels
    const lines = 2;
    let labels = '';

    for (let i = 0; i <= lines; i++) {
      const ratio = i / lines;
      const value = max - (max - min) * ratio;
      // Add padding to stay within panel bounds
      const y = top + 10 + (height - 20) * ratio;

      labels += `<text x="${x + 6}" y="${y}" fill="${TV_COLORS.gridText}" font-size="9" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" text-anchor="start">${value.toFixed(decimals)}</text>`;
    }

    return labels;
  }

  private formatOINumber(value: number): string {
    // Format OI in millions (30.9M) to save space
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return value.toFixed(0);
  }

  private renderOIAxis(min: number, max: number, top: number, height: number, x: number): string {
    // Use only 3 labels (top, middle, bottom) to avoid overlap
    const lines = 2;
    let labels = '';

    for (let i = 0; i <= lines; i++) {
      const ratio = i / lines;
      const value = max - (max - min) * ratio;
      // Add padding to stay within panel bounds (10px from top/bottom)
      const y = top + 10 + (height - 20) * ratio;

      labels += `<text x="${x + 6}" y="${y}" fill="${TV_COLORS.gridText}" font-size="9" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" text-anchor="start">${this.formatOINumber(value)}</text>`;
    }

    return labels;
  }

  private renderSmoothPath(points: Point[]): string {
    if (points.length === 0) return '';

    return points.map((point, index) => {
      return `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`;
    }).join(' ');
  }

  private formatTime(timestamp: Date | string | number): string {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private scale(value: number, min: number, max: number, outMin: number, outMax: number): number {
    if (max === min) {
      return (outMin + outMax) / 2;
    }
    const ratio = (value - min) / (max - min);
    return outMin + ratio * (outMax - outMin);
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private renderEmptyChart(width: number, height: number, input: SignalChartRenderInput): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="${TV_COLORS.background}" />
      <text x="${width / 2}" y="${height / 2}" fill="${TV_COLORS.gridText}" font-size="14" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" text-anchor="middle">
        No data available for ${this.escape(input.symbol)}
      </text>
    </svg>`;
  }
}
