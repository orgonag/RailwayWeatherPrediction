import datetime as dt
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location('recover_unit_history', Path(__file__).resolve().parents[1] / 'recover_unit_history.py')
archive = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(archive)


class UnitArchiveTests(unittest.TestCase):
    def points(self):
        start = dt.datetime(2025, 1, 1, tzinfo=archive.CST)
        return [{'time': archive.iso(start + dt.timedelta(minutes=5 * index)), 'value': index,
                 'approvalLevel': 'Reviewed', 'grade': 20, 'qualifiers': ''} for index in range(289)]

    def parse(self, rows):
        header = ['# Discharge.Working@05MA011.20110101.csv generated at 2026-05-04 03:38:58 (UTC+00:00)',
                  '# Time-series identifier: Discharge.Working@05MA011', '# UTC offset: (UTC-06:00)',
                  '# Value units: m^3/s', '# Value parameter: Discharge',
                  '# Interpolation type: Instantaneous Values', '# Export options: Corrected signal from 2011 to End of Record']
        return archive.parse_archive(header + [','.join(archive.FIELDS)] + rows, '05MA011', 'Discharge', 2025)

    def test_native_zero_and_source_strings_are_preserved(self):
        row = '2025-01-01T06:00:00Z,2025-01-01 00:00:00,0.000,Preliminary,20,'
        observations, metadata, source = self.parse([row])
        self.assertEqual(observations[0]['value'], 0)
        self.assertEqual(observations[0]['approvalLevel'], 'Preliminary')
        self.assertEqual(source[0][2], '0.000')
        self.assertEqual(metadata['sourceGeneratedAt'], '2026-05-04T03:38:58Z')

    def test_outside_subset_qualifier_format_does_not_affect_selected_year(self):
        old = '2021-01-15T04:45:00Z,2021-01-14 22:45:00,0,Approved,10,WSC – Suspect Stage,WSC - Beaver Activity'
        row = '2025-01-01T06:00:00Z,2025-01-01 00:00:00,0,Approved,20,'
        observations, _, _ = self.parse([old, row])
        self.assertEqual(len(observations), 1)
        with self.assertRaisesRegex(ValueError, 'Malformed CSV'):
            self.parse([row + ',unexpected'])

    def test_inconsistent_clocks_and_duplicate_records_fail(self):
        with self.assertRaisesRegex(ValueError, 'clocks disagree'):
            self.parse(['2025-01-01T06:00:00Z,2025-01-01 01:00:00,1,Approved,20,'])
        row = '2025-01-01T06:00:00Z,2025-01-01 00:00:00,1,Approved,20,'
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            self.parse([row, row])

    def test_unknown_grade_and_nonfinite_fail(self):
        with self.assertRaisesRegex(ValueError, 'Unknown source grade'):
            self.parse(['2025-01-01T06:00:00Z,2025-01-01 00:00:00,1,Approved,99,'])
        with self.assertRaisesRegex(ValueError, 'Non-finite'):
            self.parse(['2025-01-01T06:00:00Z,2025-01-01 00:00:00,nan,Approved,20,'])

    def test_time_weighted_complete_day_and_no_missing_to_zero(self):
        points = self.points()
        # Extra irregular point lies on the same linear series; unweighted averaging would change the result.
        points.insert(1, points[0] | {'time': '2025-01-01T06:03:00Z', 'value': 0.6})
        days = archive.derive_daily(points, 2025)
        self.assertAlmostEqual(days[0]['value'], 144)
        self.assertEqual(days[0]['sampleCount'], 290)
        self.assertEqual(days[0]['grades'], [20])
        self.assertIsNone(days[1]['value'])
        self.assertEqual(len(days), 365)

    def test_gaps_missing_boundaries_and_bad_quality_are_explicit_nulls(self):
        for bad in (self.points()[1:], self.points()[:-1], self.points()[:50] + self.points()[51:]):
            self.assertIsNone(archive.derive_daily(bad, 2025)[0]['value'])
        for grade in (-2, 0, 10, 30):
            points = self.points()
            points[50]['grade'] = grade
            day = archive.derive_daily(points, 2025)[0]
            self.assertIsNone(day['value'])
            self.assertIn('Unusable', ' '.join(day['excludedReasons']))
        points = self.points()
        points[50]['qualifiers'] = 'Unreviewed source qualifier'
        self.assertIsNone(archive.derive_daily(points, 2025)[0]['value'])

    def test_relocation_day_and_provisional_status_preserved(self):
        points = self.points()
        points[50]['approvalLevel'] = 'Preliminary'
        day = archive.derive_daily(points, 2025)[0]
        self.assertEqual(day['approvalLevels'], ['Preliminary', 'Reviewed'])
        self.assertIsNotNone(day['value'])
        day = archive.derive_daily(points, 2025, ['2025-01-01'])[0]
        self.assertIsNone(day['value'])
        self.assertIn('continuity break', ' '.join(day['excludedReasons']))


if __name__ == '__main__':
    unittest.main()
