"""Refresh real ECCC map metadata and gross-basin SWE analyses using only stdlib.

Usage: python scripts/refresh_map_layers.py
WMS capabilities: one filtered layer/request, at most three concurrent requests.
Snow: bounded WCS geographic GeoTIFF extractions, two basins concurrently. The
strict float-TIFF reader rejects unsupported encodings; it never decodes colours
or substitutes zero for a missing pixel. urllib preserves configured proxies.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json
import math
from pathlib import Path
import re
import struct
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public/data'
WMS = 'https://geo.weather.gc.ca/geomet'
CAPABILITIES = WMS + '?service=WMS&version=1.3.0&request=GetCapabilities'
NS = {'w':'http://www.opengis.net/wms'}
XLINK = '{http://www.w3.org/1999/xlink}href'
PRODUCTS = {
    'precipitationType': ('RDPS · instantaneous precipitation type', 'type', 'RDPS_10km_PrecipType-Instant', 'INSTPRECIPITATIONTYPE'),
    'precipitationRate': ('RDPS · instantaneous precipitation rate', 'mm/h', 'RDPS_10km_PrecipRate', 'PRECIPPRTMMH'),
    'precipitationAccumulation': ('RDPS · water equivalent since forecast run', 'mm since run', 'RDPS_10km_Precip-Accum', 'PRECIPMM'),
    'temperature': ('RDPS · air temperature at 2 m', '°C', 'RDPS_10km_AirTemp_2m', 'TEMPERATURE-LINEAR'),
    'wind': ('RDPS · wind gust estimate at 10 m', 'km/h', 'RDPS_10km_WindGust_10m', 'GUST_MS2KMH'),
    'snowpack': ('CaLDAS-NSRPS · snow water equivalent analysis', 'mm SWE', 'CaLDAS-NSRPS_2.5km_SnowWaterEquiv', 'SNOWMASS'),
    'radar': ('Radar · recent rain-rate observations', 'mm/h', 'RADAR_1KM_RRAI', 'RADARURPPRECIPR14-LINEAR'),
}


def iso(value):
    return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def parse_time(value):
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})', value):
        raise ValueError('Invalid or timezone-less WMS timestamp')
    return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone.utc)


def parse_wms_times(value):
    """Expand advertised fixed-duration ranges only; retain all advertised gaps."""
    if not value.strip(): raise ValueError('Missing WMS time dimension')
    times = set()
    for item in value.split(','):
        parts = item.strip().split('/')
        if len(parts) == 1: times.add(parse_time(parts[0]))
        elif len(parts) == 3:
            start, end = parse_time(parts[0]), parse_time(parts[1])
            duration = re.fullmatch(r'P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?', parts[2])
            if not duration or not any(v is not None for v in duration.groups()): raise ValueError('Unsupported WMS duration')
            days, hours, minutes, seconds = (float(v or 0) for v in duration.groups())
            step = timedelta(days=days, hours=hours, minutes=minutes, seconds=seconds)
            if end < start or (step.total_seconds() == 0 and end != start) or (step.total_seconds() > 0 and (end-start)/step > 5000):
                raise ValueError('Invalid or excessive WMS time range')
            if start == end: times.add(start)
            else:
                time = start
                while time <= end:
                    times.add(time)
                    time += step
        else: raise ValueError('Malformed WMS time range')
        if len(times) > 10000: raise ValueError('Excessive WMS frames')
    return [iso(time) for time in sorted(times)]


def get_bytes(url, limit=32*1024*1024):
    with urlopen(Request(url, headers={'User-Agent':'RWP/0.2 public research weather and basin analysis'}), timeout=35) as response:
        content = response.read(limit+1)
        if len(content) > limit: raise ValueError('Provider response exceeds bounded download limit')
        return content, response.headers


def empty_product(key, error):
    label, unit, layer, style = PRODUCTS[key]
    return dict(id=key, label=label, unit=unit, wmsLayer=layer, style=style, sourceUrl=WMS,
                times=[], runTime=None, legendUrl=None, status='unavailable', error=str(error))


def product_from_capabilities(key, content):
    label, unit, name, style_name = PRODUCTS[key]
    try:
        root = ET.fromstring(content)
        layer = next((layer for layer in root.findall('.//w:Layer', NS) if layer.findtext('w:Name', '', NS) == name), None)
        if layer is None: raise ValueError('Requested layer absent from capabilities')
        dimensions = {element.attrib['name']:element for element in layer.findall('w:Dimension', NS)}
        times = parse_wms_times(dimensions['time'].text or '')
        reference = dimensions.get('reference_time')
        run = reference.attrib.get('default') if reference is not None else None
        if key != 'radar' and not run: raise ValueError('Model reference time absent from capabilities')
        style = next((style for style in layer.findall('w:Style', NS) if style.findtext('w:Name', '', NS) == style_name), None)
        if style is None: raise ValueError('Requested style absent from capabilities')
        resource = style.find('w:LegendURL/w:OnlineResource', NS)
        legend = resource.attrib.get(XLINK) if resource is not None else None
        return dict(id=key, label=label, unit=unit, wmsLayer=name, style=style_name, sourceUrl=WMS,
                    times=times, runTime=iso(parse_time(run)) if run else None,
                    legendUrl=legend if legend and legend.startswith('https://') else None, status='available')
    except (ET.ParseError, ValueError, KeyError) as error:
        return empty_product(key, error)


def refresh_catalog():
    catalog = dict(fetchedAt=iso(datetime.now(timezone.utc)), sourceUrl=CAPABILITIES, products={}, errors=[])
    def fetch(key):
        try:
            content = get_bytes(CAPABILITIES+'&'+urlencode({'layers':PRODUCTS[key][2]}), limit=1024*1024)[0]
            return key, product_from_capabilities(key, content)
        except Exception as error: return key, empty_product(key, error)
    with ThreadPoolExecutor(max_workers=3) as pool:
        for key, product in pool.map(fetch, PRODUCTS):
            catalog['products'][key] = product
            if product['status'] == 'unavailable': catalog['errors'].append(key+': '+product['error'])
    return catalog


def read_float_geotiff(content):
    """Read bounded, uncompressed, single-band float32 geographic pixel-area TIFF.

    This is the actual GeoMet WCS image/tiff encoding. Reject unsupported layouts
    instead of guessing compression, projected coordinates or pixel values.
    """
    try:
        if content[:2] not in (b'II', b'MM'): raise ValueError('Not a TIFF response')
        endian = '<' if content[:2] == b'II' else '>'
        if struct.unpack_from(endian+'H', content, 2)[0] != 42: raise ValueError('Unsupported TIFF version')
        offset = struct.unpack_from(endian+'I', content, 4)[0]
        count = struct.unpack_from(endian+'H', content, offset)[0]
        if count > 256: raise ValueError('Excessive TIFF directory')
        tags = {}
        formats = {1:'B', 2:'c', 3:'H', 4:'I', 11:'f', 12:'d'}
        for index in range(count):
            entry = offset+2+index*12
            tag, kind, length, location = struct.unpack_from(endian+'HHII', content, entry)
            if kind not in formats: continue
            fmt = formats[kind]
            size = struct.calcsize(endian+fmt)*length
            if size > len(content): raise ValueError('Invalid TIFF field length')
            start = entry+8 if size <= 4 else location
            if start+size > len(content): raise ValueError('Truncated TIFF field')
            tags[tag] = struct.unpack_from(endian+str(length)+fmt, content, start)
        width, height = tags[256][0], tags[257][0]
        if not (0 < width*height <= 5_000_000): raise ValueError('Invalid or excessive raster size')
        if (tags[258], tags[259], tags[277], tags[339]) != ((32,), (1,), (1,), (3,)):
            raise ValueError('Only uncompressed single-band float32 TIFF is supported')
        if tags.get(274, (1,)) != (1,) or tags.get(284, (1,)) != (1,): raise ValueError('Unsupported raster orientation/layout')
        directory = tags[34735]
        if directory[:3] != (1,1,0) or len(directory) != 4+directory[3]*4: raise ValueError('Invalid GeoTIFF keys')
        keys = {directory[index]:directory[index+3] for index in range(4, len(directory), 4) if directory[index+1:index+3] == (0,1)}
        if keys.get(1024) != 2 or keys.get(1025) != 1 or keys.get(2048) != 4326: raise ValueError('Expected EPSG:4326 geographic pixel-area grid')
        dx, dy, _ = tags[33550]
        tie = tags[33922]
        if dx <= 0 or dy <= 0 or tie[:3] != (0.,0.,0.): raise ValueError('Unsupported raster georeference')
        offsets, lengths = tags[273], tags[279]
        if len(offsets) != len(lengths) or sum(lengths) != width*height*4: raise ValueError('Invalid raster strips')
        strips = []
        for start, size in zip(offsets, lengths):
            if start+size > len(content): raise ValueError('Truncated raster strip')
            strips.append(content[start:start+size])
        values = struct.unpack(endian+str(width*height)+'f', b''.join(strips))
        nodata_text = b''.join(tags.get(42113, ())).rstrip(b'\0').decode('ascii')
        nodata = float(nodata_text) if nodata_text else None
        return dict(width=width, height=height, values=values, west=tie[3], north=tie[4], dx=dx, dy=dy, nodata=nodata)
    except (struct.error, KeyError, IndexError, UnicodeError, OverflowError) as error:
        raise ValueError('Malformed or unsupported GeoTIFF: '+str(error)) from error


def in_ring(lon, lat, ring):
    inside = False
    previous = ring[-1]
    for current in ring:
        x1, y1 = previous[:2]; x2, y2 = current[:2]
        if (y1 > lat) != (y2 > lat) and lon < (x2-x1)*(lat-y1)/(y2-y1)+x1: inside = not inside
        previous = current
    return inside


def in_geometry(lon, lat, geometry):
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    if geometry['type'] not in ('Polygon', 'MultiPolygon'): raise ValueError('Unsupported basin geometry')
    return any(in_ring(lon, lat, polygon[0]) and not any(in_ring(lon, lat, hole) for hole in polygon[1:]) for polygon in polygons)


def basin_raster_mean(raster, geometry):
    """Geographic output pixel centers clipped to polygon; spherical-area weights.

    Coverage is the valid area-weighted sampled fraction, not an exact polygon
    area intersection. Preserve zero. 1e30 is a provider missing-value sentinel.
    """
    weighted = valid_weight = total_weight = 0.
    count = cells = 0
    for row in range(raster['height']):
        lat = raster['north']-(row+.5)*raster['dy']
        weight = math.cos(math.radians(lat))
        for column in range(raster['width']):
            lon = raster['west']+(column+.5)*raster['dx']
            if not in_geometry(lon, lat, geometry): continue
            cells += 1; total_weight += weight
            value = raster['values'][row*raster['width']+column]
            if not math.isfinite(value) or value < 0 or value >= 1e20 or value == raster.get('nodata'): continue
            count += 1; valid_weight += weight; weighted += value*weight
    return dict(mean=weighted/valid_weight if valid_weight else None, count=count, cells=cells,
                coverage=valid_weight/total_weight if total_weight else None)


def bounds(geometry):
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    points = [point for polygon in polygons for ring in polygon for point in ring]
    return min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)


def coverage_url(layer, geometry, time):
    west, south, east, north = bounds(geometry)
    return WMS+'?'+urlencode([('service','WCS'), ('version','2.0.1'), ('request','GetCoverage'),
        ('coverageid',layer), ('format','image/tiff'), ('time',time), ('dim_reference_time',time),
        ('subset',f'lat({south},{north})'), ('subset',f'long({west},{east})'), ('interpolation','nearest')])


def fetch_coverage(layer, geometry, time):
    url = coverage_url(layer, geometry, time)
    content, headers = get_bytes(url)
    time_token = parse_time(time).strftime('%Y-%m-%dT%H%MZ')
    if time_token not in headers.get('Content-Disposition', ''): raise ValueError('WCS response did not confirm requested analysis time')
    raster = read_float_geotiff(content)
    return basin_raster_mean(raster, geometry), raster, url


def refresh_snow(catalog):
    fetched_at = iso(datetime.now(timezone.utc))
    snapshot = dict(fetchedAt=fetched_at, basins=[], errors=[])
    features = json.loads((DATA/'basins.geojson').read_text())['features']
    product = catalog['products']['snowpack']
    time = max((t for t in product['times'] if parse_time(t) <= parse_time(fetched_at)), default=None)
    def basin(feature):
        properties = feature['properties']; geometry=feature['geometry']
        result = dict(station=properties['StationNum'], name=properties['NameNom'], time=None, sweMm=None,
                      snowDepthCm=None, seasonalMeanMm=None, coverageFraction=None, sampleCount=0,
                      method='No usable SWE analysis acquired; no depth-to-SWE conversion or seasonal normal.', sourceUrl=WMS)
        errors = []
        try:
            if not time or product['status'] != 'available': raise ValueError(product.get('error', 'No current SWE analysis advertised'))
            result['sourceUrl'] = coverage_url(product['wmsLayer'], geometry, time)
            swe, raster, url = fetch_coverage(product['wmsLayer'], geometry, time)
            result.update(time=time, sweMm=swe['mean'], coverageFraction=swe['coverage'], sampleCount=swe['count'], sourceUrl=url)
            result['method'] = (f"CaLDAS-NSRPS 2.5 km model land-surface analysis; nearest-neighbour WCS geographic extraction "
                f"({raster['width']}×{raster['height']} output pixels, {raster['dx']:.6f}° longitude × {raster['dy']:.6f}° latitude). "
                f"Pixel centers clipped to original June 2024 gross basin polygon, including holes; cos(latitude) area-weighted mean "
                f"of {swe['count']}/{swe['cells']} valid inside pixels. Coverage is valid weighted sampled area; boundary cells are approximated by centers. "
                'Zero is numeric zero; nodata/negative/nonfinite/≥1e20 pixels excluded. This is a model estimate, not a measured basin survey; no seasonal normal supplied.')
            if swe['mean'] is None: errors.append('No valid SWE pixels inside basin')
            try:
                depth, _, _ = fetch_coverage('CaLDAS-NSRPS_2.5km_SnowDepth', geometry, time)
                result['snowDepthCm'] = depth['mean']*100 if depth['mean'] is not None else None
                if depth['mean'] is None: errors.append('No valid snow-depth pixels inside basin')
                result['method'] += f" Optional snow depth independently averaged from CaLDAS-NSRPS_2.5km_SnowDepth at the same analysis time ({depth['count']}/{depth['cells']} valid output pixels); metres converted to centimetres."
            except Exception as error: errors.append('Optional snow depth: '+str(error))
        except Exception as error: errors.append(str(error))
        if errors: result['error'] = '; '.join(errors)
        return result
    with ThreadPoolExecutor(max_workers=2) as pool:
        for result in pool.map(basin, features):
            snapshot['basins'].append(result)
            if 'error' in result: snapshot['errors'].append(result['station']+': '+result['error'])
    return snapshot


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skip-snow', action='store_true', help='Refresh only WMS catalog, preserving basin snapshot')
    args = parser.parse_args()
    catalog = refresh_catalog()
    (DATA/'map-layers.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2)+'\n')
    print(f"Map catalog: {sum(p['status']=='available' for p in catalog['products'].values())}/{len(PRODUCTS)} products; {len(catalog['errors'])} errors.")
    if not args.skip_snow:
        snow = refresh_snow(catalog)
        (DATA/'basin-snow.json').write_text(json.dumps(snow, ensure_ascii=False, indent=2, allow_nan=False)+'\n')
        print(f"Basin snow: {sum(b['sweMm'] is not None for b in snow['basins'])}/{len(snow['basins'])} numeric model estimates; {len(snow['errors'])} errors.")


if __name__ == '__main__': main()
