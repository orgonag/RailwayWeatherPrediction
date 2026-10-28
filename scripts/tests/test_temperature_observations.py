import csv
import datetime as dt
import io
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parents[1]))
from refresh_temperature_observations import (archive_window, parse_daily_csv,
                                              parse_observation, retain_previous, select_stations)


class TemperatureObservationsTests(unittest.TestCase):
    def setUp(self):
        self.station = {'id': '4018642', 'name': 'WATROUS EAST', 'lat': 51.667115,
                        'lon': -105.398394, 'provider': 'MSC', 'temperatureC': None,
                        'observedAt': None}
        self.now = dt.datetime(2026, 10, 28, 5, tzinfo=dt.timezone.utc)

    def observation(self, **overrides):
        properties = {'msc_id-value': '4018642', 'stn_nam-value': 'WATROUS EAST',
                      'date_tm-value': '2026-10-28T04:45:00Z',
                      'obs_date_tm': '2026-10-28T04:45:00Z',
                      'air_temp': 0.0, 'air_temp-uom': '°C', 'air_temp-qa': 100,
                      'data_pvdr-value': 'MSC'}
        properties.update(overrides)
        return {'features': [{'id': 'real-source-id', 'type': 'Feature',
                              'geometry': {'type': 'Point', 'coordinates': [-105.398394, 51.667115]},
                              'properties': properties}]}

    def test_zero_and_exact_actual_position_and_time_remain_observations(self):
        actual = parse_observation(self.station, self.observation(), self.now)
        self.assertEqual(actual['temperatureC'], 0)
        self.assertEqual(actual['lat'], 51.667115)
        self.assertEqual(actual['lon'], -105.398394)
        self.assertEqual(actual['name'], 'WATROUS EAST')
        self.assertEqual(actual['observedAt'], '2026-10-28T04:45:00+00:00')
        self.assertIn('100: Acceptable/Passed', actual['quality'])

    def test_missing_does_not_become_zero_or_fallback_hourly_average(self):
        for value in (None, '', 'MSNG', float('nan')):
            actual = parse_observation(self.station, self.observation(**{'air_temp': value, 'avg_air_temp_pst1hr': 2}), self.now)
            self.assertIsNone(actual['temperatureC'])
        actual = parse_observation(self.station, {'features': []}, self.now)
        self.assertIsNone(actual['temperatureC'])
        self.assertIsNone(actual['observedAt'])

    def test_failed_refresh_retains_old_actual_time_and_marks_the_failure(self):
        previous = parse_observation(self.station, self.observation(), self.now)
        actual = retain_previous(self.station, previous, 'Network timeout')
        self.assertEqual(actual['observedAt'], previous['observedAt'])
        self.assertEqual(actual['temperatureC'], previous['temperatureC'])
        self.assertIn('retained dated observation after refresh failure', actual['quality'])

    def test_suppressed_suspect_estimated_and_unknown_units_are_not_plotted(self):
        for overrides in ({'air_temp-qa': -10}, {'air_temp-qa': 0}, {'air_temp-qa': 15},
                          {'air_temp-data_flag-value': 2}, {'air_temp-data_flag-value': 4},
                          {'air_temp-uom': 'K'}):
            actual = parse_observation(self.station, self.observation(**overrides), self.now)
            self.assertIsNone(actual['temperatureC'])
        actual = parse_observation(self.station, self.observation(**{'air_temp-qa': None}), self.now)
        self.assertEqual(actual['temperatureC'], 0)
        self.assertIn('no pass claimed', actual['quality'])

    def test_wrong_station_future_unzoned_conflicting_time_and_missing_position_rejected(self):
        for overrides in ({'msc_id-value': 'wrong'}, {'date_tm-value': '2026-10-28T04:45:00'},
                          {'obs_date_tm': '2026-10-28T04:44:00Z'},
                          {'date_tm-value': '2026-10-29T04:45:00Z', 'obs_date_tm': '2026-10-29T04:45:00Z'}):
            with self.assertRaises(ValueError):
                parse_observation(self.station, self.observation(**overrides), self.now)
        payload = self.observation()
        payload['features'][0]['geometry'] = {'type': 'Point', 'coordinates': [None, None]}
        with self.assertRaises(ValueError):
            parse_observation(self.station, payload, self.now)

    def test_corridor_filter_does_not_connect_chains_or_invent_town_stations(self):
        features = []
        for sid, name, point in [('11111', 'ACTUAL WEST STATION', [-110, 52]),
                                 ('22222', 'ACTUAL EAST STATION', [-100, 52]),
                                 ('33333', 'NOT NEAR EITHER CHAIN', [-105, 52])]:
            features.append({'properties': {'msc_id': sid, 'name': name, 'data_provider': 'MSC'},
                             'geometry': {'type': 'Point', 'coordinates': point}})
        stations = select_stations({'features': features}, [([-110.1, 52], [-110, 52]), ([-100.1, 52], [-100, 52])])
        self.assertEqual([s['id'] for s in stations], ['11111', '22222'])
        self.assertFalse(any(s['name'] == 'Lanigan' for s in stations))

    def daily_csv(self, rows):
        columns = ['Climate ID', 'Station Name', 'Date/Time', 'Longitude (x)', 'Latitude (y)',
                   'Mean Temp (°C)', 'Mean Temp Flag', 'Min Temp (°C)', 'Min Temp Flag',
                   'Max Temp (°C)', 'Max Temp Flag', 'Data Quality']
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=columns)
        writer.writeheader()
        for values in rows:
            writer.writerow({'Climate ID': '4018642', 'Station Name': 'WATROUS EAST',
                             'Longitude (x)': -105.40, 'Latitude (y)': 51.67, **values})
        return output.getvalue().encode()

    def test_daily_archives_keep_published_stats_flags_and_missing_days(self):
        data = self.daily_csv([
            {'Date/Time': '2026-10-20', 'Mean Temp (°C)': 0, 'Min Temp (°C)': -4, 'Max Temp (°C)': 4},
            {'Date/Time': '2026-10-22', 'Mean Temp (°C)': 5, 'Mean Temp Flag': 'E',
             'Max Temp (°C)': '', 'Max Temp Flag': 'M'},
            {'Date/Time': '2026-11-01', 'Mean Temp (°C)': 8},
        ])
        rows = parse_daily_csv(data, '4018642', dt.date(2026, 10, 1), dt.date(2026, 10, 27))
        self.assertEqual([r['date'] for r in rows], ['2026-10-20', '2026-10-22'])
        self.assertEqual(rows[0]['meanTemperatureC'], 0)
        self.assertEqual(rows[0]['minTemperatureC'], -4)
        self.assertEqual(rows[0]['maxTemperatureC'], 4)
        self.assertIsNone(rows[1]['meanTemperatureC'])
        self.assertEqual(rows[1]['meanFlag'], 'E')
        self.assertIsNone(rows[1]['maxTemperatureC'])
        self.assertEqual(rows[1]['maxFlag'], 'M')
        self.assertEqual(rows[0]['lat'], 51.67)

    def test_daily_wrong_station_duplicate_dates_and_unexpected_units_rejected(self):
        start, end = dt.date(2026, 1, 1), dt.date(2026, 12, 31)
        for rows in ([{'Date/Time': '2026-10-20', 'Climate ID': 'WRONG'}],
                     [{'Date/Time': '2026-10-20'}, {'Date/Time': '2026-10-20'}],
                     [{'Date/Time': '2026-10-20', 'Mean Temp (°C)': 'nan'}]):
            with self.assertRaises(ValueError):
                parse_daily_csv(self.daily_csv(rows), '4018642', start, end)
        with self.assertRaises(ValueError):
            parse_daily_csv(b'Date,Mean Temperature Kelvin\n2026-10-20,273.15', '4018642', start, end)

    def test_rolling_three_years_uses_corridor_calendar_and_excludes_today(self):
        self.assertEqual(archive_window(self.now), (dt.date(2023, 10, 27), dt.date(2026, 10, 26)))
        self.assertEqual(archive_window(dt.datetime(2024, 2, 29, 18, tzinfo=dt.timezone.utc)),
                         (dt.date(2021, 2, 28), dt.date(2024, 2, 28)))


if __name__ == '__main__':
    unittest.main()
