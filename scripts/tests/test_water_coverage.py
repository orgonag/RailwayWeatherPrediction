import datetime as dt
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parents[1]))
from refresh_water_coverage import archive_manifest, distance_km, merge_unit_archive, parse_wsa_hydrograph, point_in_geometry, rail_segments, select_catalogue


class WaterCoverageTests(unittest.TestCase):
    def test_independent_chains_do_not_create_a_false_nearby_gauge(self):
        network = {'tracks': {'features': [
            {'geometry': {'coordinates': [[-110, 52], [-109.9, 52]]}},
            {'geometry': {'coordinates': [[-108.1, 52], [-108, 52]]}},
        ]}}
        segments = rail_segments(network)
        self.assertEqual(len(segments), 2)
        self.assertGreater(distance_km([-109, 52], segments), 50)
        self.assertLess(distance_km([-109.95, 52.001], segments), 0.2)

    def test_wsa_and_eccc_same_station_are_one_marker_with_both_sources(self):
        federal = {'features': [{'properties': {'STATUS_EN':'Active','STATION_NUMBER':'05KB003','STATION_NAME':'CARROT',
                    'CONTRIBUTOR_EN':'WSA','PROV_TERR_STATE_LOC':'SK','REAL_TIME':0},
                    'geometry':{'coordinates':[-104,53]}}]}
        provincial = {'features':[{'properties':{'Station_Number':'05KB003','Station_Name':'CARROT','Operated_By':'WSA',
                    'Province':'SK','Major_Basin':'Saskatchewan River','Station_Class':'Seasonal',
                    'HyperLink_Graph':'https://www.wsask.ca/hydrographs/05KB003-hrly.html'},
                    'geometry':{'coordinates':[-104.001,53.001]}}]}
        stations = select_catalogue(federal,provincial,[([-104,52.99],[-104,53.01])])
        self.assertEqual(len(stations),1)
        self.assertEqual(stations[0]['provider'],'WSA')
        self.assertEqual(stations[0]['lon'],-104)
        self.assertEqual(len(stations[0]['sourceUrls']),3)

    def hydrograph(self, label='Discharge', unit='Discharge (cms)', dates=None, values=None):
        payload = {'x': {'attrs': {'title':'CARROT RIVER (05KB003)', 'labels':['hour',label], 'ylabel':unit},
                         'scale':'hourly','data':[dates or ['2026-10-27T00:00:00Z','2026-10-27T01:00:00Z'],
                                                 values if values is not None else [0,None]]}}
        return '<script type="application/json">'+json.dumps(payload)+'</script>'

    def test_public_hydrograph_preserves_zero_null_and_source_times(self):
        now = dt.datetime(2026,10,28,tzinfo=dt.timezone.utc)
        rows, provenance = parse_wsa_hydrograph(self.hydrograph(),'05KB003',now)
        self.assertEqual(rows[0]['dischargeM3s'],0)
        self.assertIsNone(rows[1]['dischargeM3s'])
        self.assertIsNone(rows[0]['levelM'])
        self.assertIn('Provisional',rows[0]['dischargeQualifier'])
        self.assertEqual(provenance[0]['sourceScale'],'hourly')

    def test_unknown_units_station_mismatch_and_unzoned_times_fail(self):
        now = dt.datetime(2026,10,28,tzinfo=dt.timezone.utc)
        for html, station in [(self.hydrograph(unit='cfs'),'05KB003'),(self.hydrograph(),'05OTHER'),
                              (self.hydrograph(dates=['2026-10-27T00:00:00'],values=[1]),'05KB003')]:
            with self.assertRaises(ValueError):
                parse_wsa_hydrograph(html,station,now)

    def test_basin_holes_stay_outside(self):
        geometry = {'type':'Polygon','coordinates':[
            [[0,0],[5,0],[5,5],[0,5],[0,0]],[[1,1],[2,1],[2,2],[1,2],[1,1]] ]}
        self.assertTrue(point_in_geometry([3,3],geometry))
        self.assertFalse(point_in_geometry([1.5,1.5],geometry))
        self.assertFalse(point_in_geometry([6,6],geometry))

    def test_recovered_dates_never_override_official_rows_or_quality(self):
        history = {'daily':[{'date':'2025-01-01','levelM':None,'dischargeM3s':None,'dischargeQualifier':'Ice Conditions'}],
                   'sourceMetadata':{},'errors':[]}
        archive = {'daily':[{'date':'2025-01-01','levelM':2,'dischargeM3s':3},
                            {'date':'2025-01-02','levelM':None,'dischargeM3s':4,'sourceType':'derived-unit-values'}]}
        result = merge_unit_archive(history,archive)
        self.assertIsNone(result['daily'][0]['dischargeM3s'])
        self.assertEqual(result['daily'][0]['dischargeQualifier'],'Ice Conditions')
        self.assertEqual(result['daily'][1]['dischargeM3s'],4)

    def test_manifest_coverage_excludes_empty_rows_but_keeps_measured_zero(self):
        history = {'station':'A','name':'A','historyPath':'data/history/A.json','fetchedAt':'2026-10-28T00:00:00Z',
                   'observations':[{'time':'2026-10-25T00:00:00Z','levelM':None,'dischargeM3s':0}],
                   'daily':[{'date':'2025-01-01','levelM':None,'dischargeM3s':0},
                            {'date':'2025-12-31','levelM':None,'dischargeM3s':None}]}
        manifest = archive_manifest(history)
        self.assertEqual(manifest['dailyThrough'],'2025-01-01')
        self.assertEqual(manifest['dailyCount'],1)
        self.assertEqual(manifest['observationThrough'],'2026-10-25T00:00:00Z')


if __name__ == '__main__':
    unittest.main()
