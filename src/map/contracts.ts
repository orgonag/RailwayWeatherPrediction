import type { FeatureCollection } from 'geojson';
import type { Gauge, Network, Sample, WeatherSnapshot } from '../types';

export type Selection = {kind:'track';id:string}|{kind:'gauge';id:string}|{kind:'basin';id:string}|{kind:'asset';id:string}|{kind:'observation';id:string}|null;
export type WeatherMode = 'precipitation'|'temperature'|'wind'|'none';
export type PrecipitationMode = 'type'|'rate'|'accumulation';
export interface LayerVisibility {gauges:boolean;basins:boolean;snowpack:boolean;assets:boolean;mileposts?:boolean;crossings?:boolean;stations?:boolean;culverts?:boolean;majorBasins?:boolean;observations?:boolean}
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
  provider?:string;operator?:string;sourceUrls?:string[];realtimeProvider?:string;
  observations:GaugeReading[];daily:GaugeDaily[];historyAvailableThrough:string|null;errors:string[];
}
export interface HydrologySnapshot {fetchedAt:string;gauges:GaugeHistory[];errors:string[]}
export interface WeatherFrameState {key:string;status:'loading'|'ready'|'error'|'unavailable'|'idle';displayedTime:string|null}
export interface MapProps {
  network:Network;weather:WeatherSnapshot|null;subdivision:string;selected:string;
  precipitationHours?:number;
  metric:'temperature'|'rain'|'wind';offset:number;now:Date;
  basins:FeatureCollection|null;showBasins:boolean;showAssets:boolean;
  onSelect:(sample:Sample)=>void;onSubdivision:(name:string)=>void;fitRequest:number;
  selection?:Selection;gauges?:Gauge[];showGauges?:boolean;
  snowpack?:BasinSnowSnapshot|null;showSnowpack?:boolean;
  weatherLayer?:WeatherLayerProduct|null;layerTime?:string|null;weatherOpacity?:number;
  assetVisibility?:LayerVisibility;majorBasins?:FeatureCollection|null;showMajorBasins?:boolean;
  weatherRequest?:number;
  onWeatherFrame?:(state:WeatherFrameState)=>void;onAsset?:(id:string)=>void;
  observations?:import('../types').TemperatureObservation[];showObservations?:boolean;onObservation?:(id:string)=>void;
  onGauge?:(station:string)=>void;onBasin?:(station:string)=>void;
  onTrackClick?:(chainId:string,lat:number,lon:number)=>void;
  alertSampleIds?:string[];
}
