import type { Position } from "./player";

export interface ScatterDataPoint {
  playerId: string;
  label: string;
  x: number;
  y: number;
  category: Position;
  isAnomaly: boolean;
}

export interface ScatterPlotData {
  points: ScatterDataPoint[];
  xLabel: string;
  yLabel: string;
  xMax: number;
  yMax: number;
}

export interface HeatMapCell {
  key: string;
  label: string;
  intensity: number;
  rawValue: number;
}

export interface HeatMapData {
  cells: HeatMapCell[];
  title: string;
  maxValue: number;
}

export interface TrendDataPoint {
  season: number;
  value: number;
}

export interface TrendLineData {
  playerId: string;
  label: string;
  points: TrendDataPoint[];
  color: string;
}

export interface BarChartBar {
  key: string;
  label: string;
  value: number;
  secondaryValue?: number;
}

export interface BarChartData {
  bars: BarChartBar[];
  yLabel: string;
  maxValue: number;
}

export interface RadarAxis {
  key: string;
  label: string;
  value: number;
  max: number;
}

export interface RadarChartData {
  axes: RadarAxis[];
  label: string;
}
