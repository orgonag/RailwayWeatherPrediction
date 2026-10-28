import sys
import unittest
import hashlib
import tempfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).parents[1]))
from build_network import (read_varint, milepost_at, coordinate_at, qualified_intervals,
                           whole_mile_assets, source_assets, verified_source)

class NetworkTests(unittest.TestCase):
    def test_signed_varints_and_truncation(self):
        self.assertEqual(read_varint(bytes.fromhex('ac02'), 0), (150, 2))
        self.assertEqual(read_varint(bytes.fromhex('03'), 0), (-2, 1))
        with self.assertRaises(ValueError): read_varint(bytes.fromhex('80'), 0)
        with self.assertRaises(ValueError): read_varint(bytes.fromhex('8200'), 0)

    def test_mileposts_interpolate_only_inside_qualified_intervals(self):
        intervals = [[(0,10),(1000,11)], [(3000,15),(4000,14)]]
        self.assertEqual(milepost_at(500,intervals),10.5)
        self.assertEqual(milepost_at(3500,intervals),14.5)
        self.assertIsNone(milepost_at(2000,intervals))
        self.assertIsNone(milepost_at(5000,intervals))

    def test_whole_miles_follow_both_directions_and_keep_chain_boundaries(self):
        chosen = {'a': ['a', 'sub-a', 'Wilkie'], 'b': ['b', 'sub-b', 'Wilkie']}
        geometry = [(52000000, -106000000, 0), (52000000, -105000000, 4000000)]
        intervals = {'a': [[(0, .25), (1000000, 1), (2000000, 2.25)],
                           [(3000000, 8), (4000000, 9)]],
                     'b': [[(0, 4.25), (4000000, .25)]]}
        assets = whole_mile_assets(chosen, {'a': geometry, 'b': geometry}, intervals)
        by_chain = {cid: [a for a in assets if a['properties']['chainId'] == cid] for cid in chosen}
        self.assertEqual([a['properties']['mp'] for a in by_chain['a']], [1, 2, 8, 9])
        self.assertEqual([a['properties']['mp'] for a in by_chain['b']], [1, 2, 3, 4])
        self.assertEqual(len({a['properties']['id'] for a in assets}), len(assets))
        self.assertEqual(by_chain['a'][0]['geometry']['coordinates'], [-105.75, 52])
        self.assertEqual(by_chain['b'][0]['geometry']['coordinates'], [-105.1875, 52])
        for asset in assets:
            self.assertEqual(asset['properties']['mileageType'], 'calculated')
            self.assertIsNone(asset['properties']['postedMp'])
        # No extrapolation to MP 0, 3..7, or 10 and no duplicate at the MP1 anchor.
        self.assertEqual(len(by_chain['a']), 4)

    def test_coordinate_lookup_does_not_extrapolate_and_handles_single_vertex(self):
        self.assertEqual(coordinate_at(0, [(52000000, -106000000, 0)]), [-106, 52])
        for distance in (-1, 1):
            with self.assertRaises(ValueError):
                coordinate_at(distance, [(52000000, -106000000, 0)])

    def test_unverified_interval_is_not_bridged_and_other_chains_are_excluded(self):
        records = dict(anchors=[
            ['a', 'one', 0, 0, 'crossing', 'posted'],
            ['a', 'two', 1609344, 1, 'crossing', 'unverified'],
            ['a', 'three', 3218688, 2, 'crossing', 'tc'],
            ['a', 'four', 4828032, 3, 'crossing', 'tc'],
            ['other', 'one', 0, 0, 'markerpost', 'posted'],
            ['other', 'two', 1000, 1, 'markerpost', 'posted'],
        ], intervals=[['i1', 'a', ['one', 'two', 'three']],
                      ['i2', 'a', ['three', 'four']],
                      ['i3', 'other', ['one', 'two']]])
        self.assertEqual(qualified_intervals(records, {'a': []}), {'a': [[(3218688, 2), (4828032, 3)]]})

    def test_monotone_short_span_mileage_jump_is_not_calibration(self):
        records = dict(anchors=[
            ['a', 'one', 0, 114.27, 'crossing', 'posted'],
            ['a', 'two', 1609344, 113.27, 'crossing', 'posted'],
            ['a', 'bad', 1967025, 28.51, 'crossing', 'posted'],
            ['a', 'four', 3576369, 27.51, 'crossing', 'posted'],
        ], intervals=[['i', 'a', ['one', 'two', 'bad', 'four']]])
        audit = []
        intervals = qualified_intervals(records, {'a': ['a', 'sub-a', 'Tisdale']}, audit)
        self.assertEqual(intervals['a'], [[(0, 114.27), (1609344, 113.27)],
                                         [(1967025, 28.51), (3576369, 27.51)]])
        self.assertIsNone(milepost_at(1800000, intervals['a']))
        self.assertEqual(len(audit), 1)
        self.assertEqual(audit[0]['startMp'], 113.27)
        self.assertEqual(audit[0]['endMp'], 28.51)

    def test_source_assets_preserve_posted_mileage_without_trusting_upstream_derived(self):
        chosen = {'a': ['a', 'sub-a', 'Wilkie'], 'b': ['b', 'sub-b', 'Sutherland']}
        records = {'assets': [
            ['crossing-1', 'crossing', None, [12.34, 'sub-a', 'tc'],
             [['a', 1500, 1500, 2500, 99.99, 99.99], ['b', 0, 0, 500, 7, 7]],
             [52000000], [-106000000]],
            ['station-1', 'station', 'Example station', [7, 'wrong-subdivision', 'posted'],
             [['b', 0, 0, 0, 7, 7]], [52000000], [-105000000]],
            ['culvert-1', 'culvert', None, None, [['other', 0, 0, 0, 0, 0]],
             [52000000], [-105000000]],
        ]}
        details = {'crossing-1': {'layer': 'CROSSING', 'attrs': {'TCID': '123', 'CROSACCES': 'Public'}},
                   'station-1': {'layer': 'STATION', 'attrs': {'STNENNAME': 'Example station'}}}
        assets = source_assets(records, chosen, {'a': [[(1000, 10), (2000, 11)]]}, details)
        self.assertEqual(len(assets), 2)
        crossing, station = (a['properties'] for a in assets)
        self.assertEqual(crossing['mp'], 10.5)
        self.assertEqual(crossing['postedMp'], 12.34)
        self.assertEqual(crossing['postedMileageTier'], 'tc')
        self.assertEqual(crossing['sourceAttributes']['TCID'], '123')
        self.assertEqual(crossing['positions'][0]['residualM'], 2.5)
        self.assertIsNone(crossing['positions'][1]['mp'])
        self.assertIsNone(station['mp'])
        self.assertIsNone(station['postedMp'])
        self.assertEqual(station['mileageType'], 'unavailable')
        self.assertEqual(station['name'], 'Example station')

    def test_unverified_published_mileage_remains_explicit(self):
        records = {'assets': [['x', 'culvert', None, [5, 'sub-a', 'unverified'],
                              [['a', 0, 0, 0, 5, 5]], [52000000], [-106000000]]]}
        assets = source_assets(records, {'a': ['a', 'sub-a', 'Wilkie']}, {},
                               {'x': {'layer': 'STRUCTURE_0', 'attrs': {}}})
        props = assets[0]['properties']
        self.assertEqual(props['postedMileageTier'], 'unverified')
        self.assertEqual(props['postedMp'], 5)
        self.assertIsNone(props['mp'])

    def test_missing_details_fail_instead_of_erasing_provenance(self):
        record = ['x', 'station', None, None, [['a', 0, 0, 0, None, None]], [52000000], [-106000000]]
        with self.assertRaisesRegex(ValueError, 'Missing source details'):
            source_assets({'assets': [record]}, {'a': ['a', 'sub-a', 'Wilkie']}, {}, {})

    def test_cached_sources_must_match_checksum_and_do_not_redownload(self):
        blob = b'public-source-data'
        manifest = {'snapshot': {'path': 'version/snapshot.bin.gz', 'gzipBytes': len(blob),
                                 'sha256': hashlib.sha256(blob).hexdigest()}}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'version/snapshot.bin.gz'
            path.parent.mkdir()
            path.write_bytes(blob)
            with patch('build_network.urlopen') as retrieve:
                self.assertEqual(verified_source(manifest, 'snapshot', root), blob)
                retrieve.assert_not_called()
                path.write_bytes(b'tampered')
                with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                    verified_source(manifest, 'snapshot', root)
                retrieve.assert_not_called()

    def test_source_paths_cannot_escape_cache(self):
        with self.assertRaises(ValueError):
            verified_source({'snapshot': {'path': '../escape.gz'}}, 'snapshot', Path('/tmp'))

if __name__ == '__main__': unittest.main()
