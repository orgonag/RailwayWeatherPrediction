import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from refresh_gauge_catchments import select_catchments


class CatchmentsTest(unittest.TestCase):
    def test_exact_ids_preserve_holes_and_report_unmapped_gauges(self):
        geometry = {'type': 'Polygon', 'coordinates': [
            [[0, 0], [4, 0], [4, 4], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 1]]
        ]}
        source = {'features': [{'properties': {'StationNum': '05MA011'}, 'geometry': geometry},
                               {'properties': {'StationNum': 'outside'}, 'geometry': geometry}]}
        result = select_catchments(source, [{'station': '05MA011', 'name': 'Birch'},
                                           {'station': '05HG022', 'name': 'Moon Lake'}], {'features': []})
        self.assertEqual(len(result['features']), 1)
        self.assertEqual(result['features'][0]['geometry'], geometry)
        self.assertIsNone(result['features'][0]['properties']['Area_km2'])
        self.assertEqual(result['missingStations'], ['05HG022'])

    def test_rejects_duplicate_or_nonpolygon_source_matches(self):
        feature = {'properties': {'StationNum': '05MA011'}, 'geometry': {'type': 'Polygon', 'coordinates': []}}
        gauges = [{'station': '05MA011', 'name': 'Birch'}]
        with self.assertRaises(ValueError):
            select_catchments({'features': [feature, feature]}, gauges, {'features': []})
        feature['geometry']['type'] = 'Point'
        with self.assertRaises(ValueError):
            select_catchments({'features': [feature]}, gauges, {'features': []})


if __name__ == '__main__':
    unittest.main()
