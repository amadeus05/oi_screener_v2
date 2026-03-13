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
  openInterestPoints: OpenInterestPoint[];
  minuteTradeDeltas: MinuteTradeDelta[];
  width?: number;
  height?: number;
};

type Point = { x: number; y: number };

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
        value: input.width ?? 1400,
      },
    });

    return resvg.render().asPng();
  }

  public renderSvg(input: SignalChartRenderInput): string {
    const width = input.width ?? 1400;
    const height = input.height ?? 920;
    const padding = { left: 64, right: 88, top: 68, bottom: 42 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const priceHeight = Math.floor(innerHeight * 0.5);
    const oiHeight = Math.floor(innerHeight * 0.18);
    const deltaHeight = Math.floor(innerHeight * 0.16);
    const volumeHeight = innerHeight - priceHeight - oiHeight - deltaHeight - 36;

    const priceTop = padding.top;
    const oiTop = priceTop + priceHeight + 12;
    const deltaTop = oiTop + oiHeight + 12;
    const volumeTop = deltaTop + deltaHeight + 12;

    const candles = input.candles.slice(-60);
    const oi = input.openInterestPoints.slice(-60);
    const deltas = input.minuteTradeDeltas.slice(-60);

    const priceMin = Math.min(...candles.map((c) => c.low));
    const priceMax = Math.max(...candles.map((c) => c.high));
    const oiMin = Math.min(...oi.map((p) => p.openInterest));
    const oiMax = Math.max(...oi.map((p) => p.openInterest));
    const deltaMin = Math.min(0, ...deltas.map((d) => d.deltaRatio));
    const deltaMax = Math.max(0, ...deltas.map((d) => d.deltaRatio));
    const volumeMax = Math.max(...candles.map((c) => c.volume));

    const stepX = innerWidth / Math.max(1, candles.length);
    const candleBodyWidth = Math.max(4, stepX * 0.58);

    const background = `
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#08111d"/>
          <stop offset="55%" stop-color="#0f1d30"/>
          <stop offset="100%" stop-color="#09131f"/>
        </linearGradient>
        <linearGradient id="panelGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(59,130,246,0.14)"/>
          <stop offset="100%" stop-color="rgba(59,130,246,0.02)"/>
        </linearGradient>
        <filter id="softGlow">
          <feGaussianBlur stdDeviation="12" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <rect x="20" y="20" width="${width - 40}" height="${height - 40}" rx="28" fill="rgba(7,15,24,0.56)" stroke="rgba(148,163,184,0.12)"/>
      <rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="24" fill="rgba(6,13,21,0.58)"/>
    `;

    const grid = [
      this.renderPanel(priceTop, priceHeight, padding.left, innerWidth, 'PRICE'),
      this.renderPanel(oiTop, oiHeight, padding.left, innerWidth, 'OI'),
      this.renderPanel(deltaTop, deltaHeight, padding.left, innerWidth, 'DELTA'),
      this.renderPanel(volumeTop, volumeHeight, padding.left, innerWidth, 'VOL'),
    ].join('');

    const candleSvg = candles
      .map((candle, index) => {
        const x = padding.left + index * stepX + stepX / 2;
        const openY = this.scale(candle.open, priceMin, priceMax, priceTop + priceHeight - 10, priceTop + 10);
        const closeY = this.scale(candle.close, priceMin, priceMax, priceTop + priceHeight - 10, priceTop + 10);
        const highY = this.scale(candle.high, priceMin, priceMax, priceTop + priceHeight - 10, priceTop + 10);
        const lowY = this.scale(candle.low, priceMin, priceMax, priceTop + priceHeight - 10, priceTop + 10);
        const color = candle.close >= candle.open ? '#18c37e' : '#ff5b6e';
        const bodyY = Math.min(openY, closeY);
        const bodyHeight = Math.max(2, Math.abs(closeY - openY));

        return `
          <line x1="${x}" y1="${highY}" x2="${x}" y2="${lowY}" stroke="${color}" stroke-width="1.4" />
          <rect x="${x - candleBodyWidth / 2}" y="${bodyY}" width="${candleBodyWidth}" height="${bodyHeight}" rx="2" fill="${color}" />
        `;
      })
      .join('');

    const oiPath = this.renderLinePath(
      oi.map((point, index) => ({
        x: padding.left + index * stepX + stepX / 2,
        y: this.scale(point.openInterest, oiMin, oiMax, oiTop + oiHeight - 8, oiTop + 8),
      })),
    );

    const deltaPath = this.renderLinePath(
      deltas.map((delta, index) => ({
        x: padding.left + index * stepX + stepX / 2,
        y: this.scale(
          delta.deltaRatio,
          deltaMin,
          deltaMax,
          deltaTop + deltaHeight - 10,
          deltaTop + 10,
        ),
      })),
    );
    const deltaZeroY = this.scale(
      0,
      deltaMin,
      deltaMax,
      deltaTop + deltaHeight - 10,
      deltaTop + 10,
    );

    const volumeSvg = candles
      .map((candle, index) => {
        const x = padding.left + index * stepX + stepX / 2;
        const heightValue = this.scale(candle.volume, 0, volumeMax, 0, volumeHeight - 12);
        const y = volumeTop + volumeHeight - heightValue - 8;
        const color = candle.close >= candle.open ? 'rgba(24,195,126,0.72)' : 'rgba(255,91,110,0.72)';
        return `<rect x="${x - candleBodyWidth / 2}" y="${y}" width="${candleBodyWidth}" height="${heightValue}" rx="2" fill="${color}" />`;
      })
      .join('');

    const header = `
      <text x="${padding.left}" y="54" fill="#e2e8f0" font-size="28" font-family="Segoe UI, Arial" font-weight="700">
        ${this.escape(input.exchange)} | ${this.escape(input.symbol)} | ${this.escape(input.direction)} #${input.signalNumber}
      </text>
      <text x="${padding.left}" y="84" fill="#8aa0b8" font-size="14" font-family="Segoe UI, Arial">
        Screener signal chart • Price / Open Interest / Delta / Volume
      </text>
      <circle cx="${width - 118}" cy="48" r="8" fill="${input.direction === 'LONG' ? '#22c55e' : '#ef4444'}" filter="url(#softGlow)" />
      <text x="${width - 100}" y="53" fill="#dbeafe" font-size="15" font-family="Segoe UI, Arial" font-weight="700">
        ${input.direction}
      </text>
    `;

    const axes = `
      ${this.renderRightAxisLabels(priceMin, priceMax, priceTop, priceHeight, width - 76)}
      ${this.renderRightAxisLabels(oiMin, oiMax, oiTop, oiHeight, width - 76, 2, '#93c5fd')}
      ${this.renderRightAxisLabels(deltaMin, deltaMax, deltaTop, deltaHeight, width - 76, 2, '#f9a8d4')}
    `;

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        ${background}
        ${header}
        ${grid}
        ${candleSvg}
        <path d="${oiPath}" fill="none" stroke="#7dd3fc" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" filter="url(#softGlow)" />
        <line
          x1="${padding.left}"
          y1="${deltaZeroY}"
          x2="${padding.left + innerWidth}"
          y2="${deltaZeroY}"
          stroke="rgba(250,204,21,0.18)"
          stroke-width="1"
          stroke-dasharray="6 6"
        />
        <path
          d="${deltaPath}"
          fill="none"
          stroke="#facc15"
          stroke-width="3"
          stroke-linejoin="round"
          stroke-linecap="round"
          filter="url(#softGlow)"
        />
        ${volumeSvg}
        ${axes}
      </svg>
    `;
  }

  private renderPanel(top: number, height: number, left: number, width: number, label: string): string {
    const rows = 4;
    const cols = 8;
    const horizontal = Array.from({ length: rows + 1 }, (_, i) => {
      const y = top + (height / rows) * i;
      return `<line x1="${left}" y1="${y}" x2="${left + width}" y2="${y}" stroke="rgba(148,163,184,0.10)" stroke-width="1" />`;
    }).join('');
    const vertical = Array.from({ length: cols + 1 }, (_, i) => {
      const x = left + (width / cols) * i;
      return `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + height}" stroke="rgba(148,163,184,0.06)" stroke-width="1" />`;
    }).join('');

    return `
      <rect x="${left}" y="${top}" width="${width}" height="${height}" rx="14" fill="rgba(15,23,42,0.48)" stroke="rgba(148,163,184,0.10)" />
      <rect x="${left}" y="${top}" width="${width}" height="${height}" rx="14" fill="url(#panelGlow)" />
      ${horizontal}
      ${vertical}
      <text x="${left + 14}" y="${top + 22}" fill="#7c93ad" font-size="12" font-family="Segoe UI, Arial" font-weight="700">${label}</text>
    `;
  }

  private renderLinePath(points: Point[]): string {
    if (points.length === 0) {
      return '';
    }

    return points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');
  }

  private renderRightAxisLabels(
    min: number,
    max: number,
    top: number,
    height: number,
    x: number,
    decimals = 4,
    color = '#94a3b8',
  ): string {
    return Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      const value = max - (max - min) * ratio;
      const y = top + height * ratio + 4;
      return `<text x="${x}" y="${y}" fill="${color}" font-size="12" font-family="Segoe UI, Arial" text-anchor="end">${value.toFixed(decimals)}</text>`;
    }).join('');
  }

  private scale(
    value: number,
    min: number,
    max: number,
    outMin: number,
    outMax: number,
  ): number {
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
}
