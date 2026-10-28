import type { FeatureCollection } from 'geojson';
import type { Gauge, Network, Sample, WeatherSnapshot } from '../types';

export type Selection = {kind:'track';id:string}|{kind:'gauge';id:string}|{kind:'basin';id:string}|null;
export type WeatherMode = 'precipitation'|'temperature'|'wind'|'none';
export type PrecipitationMode = 'type'|'rate'|'accumulation';
export interface LayerVisibility {gauges:boolean;basins:boolean;snowpack:boolean;assets:boolean}
export interface WeatherLayerProduct {
  id:string;label:string;unit:string;wmsLayer:string;style?:string;
  sourceUrl:string;times:string[];runTime:string|null;legendUrl:string|null;
  status:'available'|'unavailable';error?:string;
}
export interface LayerCatalog {fetchedAt:string;sourceUrl:string;products:Record<string,WeatherLayerProduct>;errors:string[]}
export interface BasinSnow {
  station:string;name:string;time:string|null;sweMm:number|null;snowDepthCm:number|null;
  seasonalMeanMm:number|null;coverageFraction:number|null;sampleCount:number;
  method:string;sourceUrl:string;error?:string;
}
export interface BasinSnowSnapshot {fetchedAt:string;basins:BasinSnow[];errors:string[]}
export interface GaugeReading {time:string;levelM:number|null;dischargeM3s:number|null}
export interface GaugeDaily {date:string;levelM:number|null;dischargeM3s:number|null}
export interface GaugeHistory {
  station:string;name:string;lat:number;lon:number;sourceUrl:string;datum:string|null;
  observations:GaugeReading[];daily:GaugeDaily[];historyAvailableThrough:string|null;errors:string[];
}
export interface HydrologySnapshot {fetchedAt:string;gauges:GaugeHistory[];errors:string[]}
export interface MapProps {
  network:Network;weather:WeatherSnapshot|null;subdivision:string;selected:string;
  metric:'temperature'|'rain'|'wind';offset:number;now:Date;
  basins:FeatureCollection|null;showBasins:boolean;showAssets:boolean;
  onSelect:(sample:Sample)=>void;onSubdivision:(name:string)=>void;fitRequest:number;
  selection?:Selection;gauges?:Gauge[];showGauges?:boolean;
  snowpack?:BasinSnowSnapshot|null;showSnowpack?:boolean;
  weatherLayer?:WeatherLayerProduct|null;layerTime?:string|null;weatherOpacity?:number;
  onGauge?:(station:string)=>void;onBasin?:(station:string)=>void;
  onTrackClick?:(chainId:string,lat:number,lon:number)=>void;
  alertSampleIds?:string[];
}
