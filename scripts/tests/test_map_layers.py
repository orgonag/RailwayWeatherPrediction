"""Regression fixtures: missing raster pixels must never become snow-free samples."""
import importlib.util
import math
from pathlib import Path
import struct
import unittest

SPEC = importlib.util.spec_from_file_location('refresh_map_layers', Path(__file__).parents[1] / 'refresh_map_layers.py')
layers = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(layers)


def float_tiff(values, width=2, height=2, compression=1):
    """Small real TIFF fixture, geographic pixel-area grid at [-106,50,-104,52]."""
    entries = [(256, 4, (width,)), (257, 4, (height,)), (258, 3, (32,)),
               (259, 3, (compression,)), (273, 4, (0,)), (277, 3, (1,)),
               (278, 4, (height,)), (279, 4, (len(values)*4,)), (339, 3, (3,)),
               (33550, 12, (2/width, 2/height, 0.)),
               (33922, 12, (0., 0., 0., -106., 52., 0.)),
               (34735, 3, (1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326))]
    offset = 8+2+12*len(entries)+4
    directory = bytearray(); extra = bytearray()
    for tag, kind, vals in entries:
        raw = struct.pack('<'+str(len(vals))+{3:'H', 4:'I', 12:'d'}[kind], *vals)
        if len(raw)>4:
            location = struct.pack('<I', offset+len(extra)); extra.extend(raw)
        else: location = raw.ljust(4, b'\0')
        directory.extend(struct.pack('<HHI', tag, kind, len(vals))+location)
    pixel_offset = offset+len(extra)
    strip_entry = 4*12
    struct.pack_into('<I', directory, strip_entry+8, pixel_offset)
    return b'II*\x00'+struct.pack('<I', 8)+struct.pack('<H', len(entries))+directory+b'\0'*4+extra+struct.pack('<'+str(len(values))+'f', *values)


class MapLayersTest(unittest.TestCase):
    def test_provider_single_analysis_and_disjoint_ranges(self):
        self.assertEqual(layers.parse_wms_times('2026-10-27T18:00:00Z/2026-10-27T18:00:00Z/PT0H'), ['2026-10-27T18:00:00Z'])
        self.assertEqual(layers.parse_wms_times('2026-10-28T02:00:00Z/2026-10-28T04:00:00Z/PT1H,2026-10-28T06:00:00Z'),
                         ['2026-10-28T02:00:00Z','2026-10-28T03:00:00Z','2026-10-28T04:00:00Z','2026-10-28T06:00:00Z'])

    def test_unsafe_ranges_are_rejected(self):
        for value in ['2026-10-28T02:00/2026-10-28T04:00/PT1H', '2026-10-28T02:00Z/2026-10-28T04:00Z/PT0H',
                      '2026-10-28T02:00Z/2026-10-28T04:00Z/P1M', '2000-01-01T00:00Z/2030-01-01T00:00Z/PT1S']:
            with self.subTest(value=value), self.assertRaises(ValueError): layers.parse_wms_times(value)

    def test_raw_float_tiff_preserves_zero_and_missing_sentinel(self):
        raster = layers.read_float_geotiff(float_tiff([0., 4., 1e30, 8.]))
        self.assertEqual((raster['width'], raster['height']), (2,2))
        self.assertEqual(raster['values'][0], 0.)
        self.assertGreater(raster['values'][2], 1e20)
        self.assertEqual((raster['west'], raster['north'], raster['dx'], raster['dy']), (-106.,52.,1.,1.))

    def test_unsupported_or_truncated_tiff_is_rejected(self):
        for content in [b'XML exception', float_tiff([0., 4., 5., 8.], compression=5), float_tiff([0., 4., 5., 8.])[:-2]]:
            with self.subTest(length=len(content)), self.assertRaises(ValueError): layers.read_float_geotiff(content)

    def test_polygon_holes_and_missing_coverage_keep_zero_as_valid(self):
        geometry = {'type':'Polygon','coordinates':[[[-106,50],[-104,50],[-104,52],[-106,52],[-106,50]]]}
        raster = layers.read_float_geotiff(float_tiff([0., 4., 1e30, 8.]))
        result = layers.basin_raster_mean(raster, geometry)
        north_weight = math.cos(math.radians(51.5)); south_weight=math.cos(math.radians(50.5))
        self.assertAlmostEqual(result['mean'], (4*north_weight+8*south_weight)/(2*north_weight+south_weight))
        self.assertEqual(result['count'], 3)
        self.assertAlmostEqual(result['coverage'], (2*north_weight+south_weight)/(2*north_weight+2*south_weight))
        geometry['coordinates'].append([[-106,51],[-105,51],[-105,52],[-106,52],[-106,51]])
        result = layers.basin_raster_mean(raster, geometry)
        self.assertEqual(result['count'], 2)
        self.assertGreater(result['mean'], 4.)

    def test_all_missing_is_unknown_and_all_numeric_zero_is_snow_free(self):
        geometry = {'type':'Polygon','coordinates':[[[-106,50],[-104,50],[-104,52],[-106,52],[-106,50]]]}
        missing = layers.basin_raster_mean(layers.read_float_geotiff(float_tiff([1e30]*4)), geometry)
        self.assertIsNone(missing['mean']); self.assertEqual(missing['coverage'], 0.)
        zero = layers.basin_raster_mean(layers.read_float_geotiff(float_tiff([0.]*4)), geometry)
        self.assertEqual(zero['mean'], 0.); self.assertEqual(zero['coverage'], 1.)


if __name__ == '__main__': unittest.main()
