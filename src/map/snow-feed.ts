import type { FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import type { BasinSnow, BasinSnowSnapshot, WeatherLayerProduct } from './contracts';
import { parseWmsTimes } from './layers';

const WCS='https://geo.weather.gc.ca/geomet';
const SWE='CaLDAS-NSRPS_2.5km_SnowWaterEquiv';
const STATIONS=new Set(['05MA011','05KB003']);
type BasinGeometry=Polygon|MultiPolygon;
export interface FloatRaster {width:number;height:number;values:Float32Array;west:number;north:number;dx:number;dy:number;nodata:number|null}

/** Strict subset of actual GeoMet WCS encoding; colours/compression/projections are never guessed. */
export function readFloatGeoTiff(buffer:ArrayBuffer):FloatRaster {
  if(buffer.byteLength<8 || buffer.byteLength>1024*1024) throw new Error('Invalid or excessive GeoTIFF response');
  const bytes=new Uint8Array(buffer),view=new DataView(buffer);
  const little=bytes[0]===73 && bytes[1]===73;
  if(!little && !(bytes[0]===77 && bytes[1]===77)) throw new Error('Expected a GeoTIFF response');
  const check=(start:number,size:number)=>{
    if(!Number.isSafeInteger(start) || !Number.isSafeInteger(size) || start<0 || size<0 || start+size>buffer.byteLength) throw new Error('Truncated GeoTIFF');
  };
  const short=(at:number)=>{check(at,2);return view.getUint16(at,little);};
  const long=(at:number)=>{check(at,4);return view.getUint32(at,little);};
  if(short(2)!==42) throw new Error('Unsupported TIFF version');
  const offset=long(4),count=short(offset),tags=new Map<number,number[]>();
  if(count>256) throw new Error('Excessive TIFF directory');
  for(let i=0;i<count;i++){
    const at=offset+2+i*12;check(at,12);
    const tag=short(at),kind=short(at+2),length=long(at+4);
    const size:Record<number,number>={1:1,2:1,3:2,4:4,11:4,12:8};
    if(!size[kind]) continue;
    const total=length*size[kind],start=total<=4?at+8:long(at+8);check(start,total);
    const values:number[]=[];
    for(let j=0;j<length;j++){
      const p=start+j*size[kind];
      values.push(kind<=2?view.getUint8(p):kind===3?short(p):kind===4?long(p):kind===11?view.getFloat32(p,little):view.getFloat64(p,little));
    }
    tags.set(tag,values);
  }
  const get=(tag:number)=>{const value=tags.get(tag);if(!value) throw new Error(`Missing GeoTIFF tag ${tag}`);return value;};
  const scalar=(tag:number,expected:number)=>{const value=get(tag);if(value.length!==1 || value[0]!==expected) throw new Error('Unsupported raster encoding');};
  const width=get(256)[0],height=get(257)[0];
  if(!width || !height || width*height>10000) throw new Error('Excessive raster size for browser basin refresh');
  scalar(258,32);scalar(259,1);scalar(277,1);scalar(339,3);
  if((tags.get(274)??[1])[0]!==1 || (tags.get(284)??[1])[0]!==1) throw new Error('Unsupported raster orientation/layout');
  const directory=get(34735),keys=new Map<number,number>();
  if(directory[0]!==1 || directory[1]!==1 || directory[2]!==0 || directory.length!==4+directory[3]*4) throw new Error('Invalid GeoTIFF keys');
  for(let i=4;i<directory.length;i+=4) if(directory[i+1]===0 && directory[i+2]===1) keys.set(directory[i],directory[i+3]);
  if(keys.get(1024)!==2 || keys.get(1025)!==1 || keys.get(2048)!==4326) throw new Error('Expected EPSG:4326 geographic pixel-area grid');
  const scale=get(33550),tie=get(33922),dx=scale[0],dy=scale[1],west=tie[3],north=tie[4];
  if(scale.length!==3 || tie.length!==6 || tie.slice(0,3).some(v=>v!==0) || ![dx,dy,west,north].every(Number.isFinite) || dx<=0 || dy<=0 || north>90 || north-height*dy< -90 || west< -180 || west+width*dx>180) throw new Error('Unsupported raster georeference');
  const offsets=get(273),lengths=get(279);
  if(offsets.length!==lengths.length || lengths.reduce((sum,v)=>sum+v,0)!==width*height*4) throw new Error('Invalid raster strips');
  const values=new Float32Array(width*height);let index=0;
  for(let i=0;i<offsets.length;i++){
    check(offsets[i],lengths[i]);
    if(lengths[i]%4) throw new Error('Unaligned raster strip');
    for(let j=0;j<lengths[i];j+=4) values[index++]=view.getFloat32(offsets[i]+j,little);
  }
  const nodataText=String.fromCharCode(...(tags.get(42113)??[])).replace(/\0+$/,'');
  const nodata=nodataText?Number(nodataText):null;
  if(nodataText && !Number.isFinite(nodata) && nodataText.toLowerCase()!=='nan') throw new Error('Invalid nodata metadata');
  return {width,height,values,west,north,dx,dy,nodata};
}

function inRing(lon:number,lat:number,ring:Position[]):boolean {
  let inside=false,previous=ring[ring.length-1];
  for(const current of ring){
    const [x1,y1]=previous,[x2,y2]=current;
    if((y1>lat)!==(y2>lat) && lon<(x2-x1)*(lat-y1)/(y2-y1)+x1) inside=!inside;
    previous=current;
  }
  return inside;
}
function polygons(geometry:BasinGeometry):Position[][][] {return geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;}

/** Same center clipping and cos(latitude) weighting as the Python acquisition. */
export function basinRasterMean(raster:FloatRaster,geometry:BasinGeometry):{mean:number|null;count:number;cells:number;coverage:number|null} {
  let weighted=0,validWeight=0,totalWeight=0,count=0,cells=0;
  const rings=polygons(geometry);
  for(let row=0;row<raster.height;row++){
    const lat=raster.north-(row+.5)*raster.dy,weight=Math.cos(lat*Math.PI/180);
    for(let column=0;column<raster.width;column++){
      const lon=raster.west+(column+.5)*raster.dx;
      if(!rings.some(polygon=>inRing(lon,lat,polygon[0]) && !polygon.slice(1).some(hole=>inRing(lon,lat,hole)))) continue;
      cells++;totalWeight+=weight;
      const value=raster.values[row*raster.width+column];
      if(!Number.isFinite(value) || value<0 || value>=1e20 || value===raster.nodata) continue;
      count++;validWeight+=weight;weighted+=value*weight;
    }
  }
  return {mean:validWeight?weighted/validWeight:null,count,cells,coverage:totalWeight?validWeight/totalWeight:null};
}

function coverageUrl(geometry:BasinGeometry,time:string,run:string):string {
  const points=polygons(geometry).flat(2);
  if(!points.length || points.some(point=>point.length<2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) throw new Error('Invalid basin coordinates');
  const west=Math.min(...points.map(p=>p[0])),east=Math.max(...points.map(p=>p[0])),south=Math.min(...points.map(p=>p[1])),north=Math.max(...points.map(p=>p[1]));
  if(west< -180 || east>180 || south< -90 || north>90 || east<=west || north<=south || east-west>5 || north-south>5) throw new Error('Basin subset exceeds browser acquisition bounds');
  const url=new URL(WCS);
  // GeoMet dimension matching rejects fractional .000Z even for an exact hour.
  url.search=new URLSearchParams([['service','WCS'],['version','2.0.1'],['request','GetCoverage'],['coverageid',SWE],['format','image/tiff'],['time',time.replace(/\.000Z$/,'Z')],['dim_reference_time',run.replace(/\.000Z$/,'Z')],['subset',`lat(${south},${north})`],['subset',`long(${west},${east})`],['interpolation','nearest']]).toString();
  return url.toString();
}

async function boundedBody(response:Response):Promise<ArrayBuffer> {
  const reader=response.body?.getReader();
  if(!reader) throw new Error('Empty WCS body');
  const chunks:Uint8Array[]=[];let size=0;
  try {
    while(true){
      const next=await reader.read();if(next.done) break;
      size+=next.value.byteLength;
      if(size>1024*1024){await reader.cancel();throw new Error('WCS response exceeds browser download limit');}
      chunks.push(next.value);
    }
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return bytes.buffer;
}

/** At most two small SWE-only requests. A failed transport/encoding rejects atomically.
 * Depth and seasonal normals remain null; analysis time is independent of the weather clock.
 */
export async function refreshBasinSnow(basins:FeatureCollection,product:WeatherLayerProduct,signal?:AbortSignal):Promise<BasinSnowSnapshot> {
  if(signal?.aborted) throw signal.reason??new DOMException('Aborted','AbortError');
  if(product.status!=='available' || product.wmsLayer!==SWE || !product.runTime) throw new Error('No usable CaLDAS SWE analysis advertised');
  const now=Date.now(),times=product.times.map(value=>{
    const parsed=parseWmsTimes(value);if(parsed.length!==1) throw new Error('Expected explicit SWE analysis instants');return parsed[0];
  }).filter(value=>Date.parse(value)<=now).sort((a,b)=>Date.parse(a)-Date.parse(b));
  const time=times.at(-1),run=parseWmsTimes(product.runTime);
  if(!time || run.length!==1 || Date.parse(run[0])!==Date.parse(time)) throw new Error('SWE analysis valid time and reference run do not match');
  if(!basins.features.length || basins.features.length>2) throw new Error('Only the two established gross basins can refresh in the browser');
  const stations=new Set<string>();
  const requests=basins.features.map(feature=>{
    const station=feature.properties?.StationNum;
    if(typeof station!=='string' || !STATIONS.has(station) || stations.has(station)) throw new Error('Unknown or duplicate gross basin');
    stations.add(station);
    if(!feature.geometry || !['Polygon','MultiPolygon'].includes(feature.geometry.type)) throw new Error('Expected gross basin polygon');
    const geometry=feature.geometry as BasinGeometry;
    return {station,name:String(feature.properties?.NameNom??station),geometry,url:coverageUrl(geometry,time,run[0])};
  });
  const controller=new AbortController(),abort=()=>controller.abort(signal?.reason);
  signal?.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(()=>controller.abort(new DOMException('SWE request timed out','TimeoutError')),30000);
  try {
    const results=await Promise.all(requests.map(async(request):Promise<BasinSnow>=>{
      const response=await fetch(request.url,{signal:controller.signal});
      if(!response.ok) throw new Error(`GeoMet WCS HTTP ${response.status}`);
      if(!response.headers.get('Content-Type')?.toLowerCase().includes('image/tiff')) throw new Error('GeoMet WCS did not return the requested analysis GeoTIFF');
      // GeoMet does not expose Content-Disposition through CORS. Explicit invalid
      // TIME/DIM_REFERENCE_TIME requests were verified to return XML NoMatch.
      const disposition=response.headers.get('Content-Disposition');
      const timeToken=time.slice(0,13)+time.slice(14,16)+'Z';
      if(disposition && !disposition.includes(timeToken)) throw new Error('WCS attachment analysis time differs from request');
      const raster=readFloatGeoTiff(await boundedBody(response)),mean=basinRasterMean(raster,request.geometry);
      return {station:request.station,name:request.name,time,sweMm:mean.mean,snowDepthCm:null,seasonalMeanMm:null,
        coverageFraction:mean.coverage,sampleCount:mean.count,sourceUrl:request.url,
        method:`CaLDAS-NSRPS 2.5 km model land-surface SWE analysis; nearest-neighbour WCS geographic extraction (${raster.width}×${raster.height} output pixels, ${raster.dx.toFixed(6)}° longitude × ${raster.dy.toFixed(6)}° latitude). Pixel centers clipped to original June 2024 gross basin polygon, including holes; cos(latitude) area-weighted mean of ${mean.count}/${mean.cells} valid inside pixels. Coverage is valid weighted sampled area; boundary cells are approximated by centers. Zero is numeric zero; nodata/negative/nonfinite/≥1e20 pixels excluded. Model estimate, not a measured basin survey; no seasonal normal or depth-to-SWE conversion. Browser refresh acquires SWE only; independent snow depth unavailable.`,
        ...(mean.mean===null?{error:'No valid SWE pixels inside basin'}:{}),
      };
    }));
    if(signal?.aborted) throw signal.reason??new DOMException('Aborted','AbortError');
    return {fetchedAt:new Date().toISOString(),basins:results,errors:results.filter(result=>result.error).map(result=>`${result.station}: ${result.error}`)};
  } finally {clearTimeout(timeout);signal?.removeEventListener('abort',abort);controller.abort();}
}
