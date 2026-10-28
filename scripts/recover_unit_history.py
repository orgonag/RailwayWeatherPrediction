#!/usr/bin/env python3
"""Recover a bounded ECCC unit-value archive subset without overwriting HYDAT.

The downloadable CSV keeps native values and quality fields. The small JSON contains
RWP-derived daily integrals, never official HYDAT daily means. See docs/UNIT-HISTORY.md.
"""
from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import hashlib
import io
import json
import lzma
import math
from pathlib import Path
import re
import urllib.parse
import urllib.request

BASE = 'https://collaboration.cmc.ec.gc.ca/cmc/hydrometrics/www/UnitValueData/'
DISCLAIMER = BASE + 'UnitValueData_Disclaimer.pdf'
CST = dt.timezone(dt.timedelta(hours=-6))
UTC = dt.timezone.utc
FIELDS = ['ISO 8601 UTC', 'Timestamp (UTC-06:00)', 'Value', 'Approval Level', 'Grade', 'Qualifiers']
GRADE_LABELS = {-2: 'UNUSABLE', -1: 'UNSPECIFIED', 0: 'UNDEFINED', 10: 'ICE',
                20: 'ESTIMATED', 30: 'PARTIAL DAY', 40: 'DRY', 50: 'REVISED'}
EXCLUDED_GRADES = {-2, 0, 10, 30}
STATIONS = {
    '05MA011': {'name': 'Birch Creek near Elfros', 'levelContinuityBreaks': ['2025-06-10']},
    '05KB003': {'name': 'Carrot River near Armley', 'levelContinuityBreaks': []},
}


def iso(value: dt.datetime) -> str:
    return value.astimezone(UTC).isoformat().replace('+00:00', 'Z')


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def fetch(url: str, max_bytes: int = 25_000_000) -> tuple[bytes, dict]:
    if not url.startswith(BASE):
        raise ValueError('Only the official ECCC UnitValueData archive is accepted')
    request = urllib.request.Request(url, headers={'User-Agent': 'RWP-research/0.1 (public historical hydrometric data)'})
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read(max_bytes + 1)
        if len(raw) > max_bytes:
            raise ValueError('Source exceeds the bounded download size')
        metadata = {'url': url, 'fetchedAt': iso(dt.datetime.now(UTC)),
                    'httpLastModified': response.headers.get('Last-Modified'),
                    'httpDate': response.headers.get('Date'), 'etag': response.headers.get('ETag'),
                    'sha256': sha256(raw), 'bytes': len(raw)}
    return raw, metadata


def parse_archive(lines, station: str, kind: str, year: int) -> tuple[list[dict], dict, list[list[str]]]:
    """Strictly parse the source's native records in one CST year plus its end boundary.

    Each selected source row is preserved separately from its numeric interpretation.
    Unknown grades/statuses, inconsistent clocks and duplicates fail the acquisition.
    """
    iterator = iter(lines)
    comments = []
    for line in iterator:
        if line.startswith('#'):
            comments.append(line.rstrip('\r\n'))
        else:
            header = next(csv.reader([line]))
            break
    else:
        raise ValueError('No CSV header found')
    if header != FIELDS:
        raise ValueError(f'Unexpected source columns: {header}')
    header_text = '\n'.join(comments)
    expected_units = 'm^3/s' if kind == 'Discharge' else 'm'
    required = [f'# Time-series identifier: {kind}.Working@{station}',
                '# UTC offset: (UTC-06:00)', f'# Value units: {expected_units}',
                f'# Value parameter: {kind}', '# Interpolation type: Instantaneous Values']
    if any(item not in comments for item in required) or '# Export options: Corrected signal ' not in header_text:
        raise ValueError('Archive identity, units, clock, or corrected-signal metadata mismatch')
    generated = re.search(r'generated at (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \(UTC\+00:00\)', header_text)
    if not generated:
        raise ValueError('Source generation timestamp is missing')
    start = dt.datetime(year, 1, 1, tzinfo=CST).astimezone(UTC)
    end = dt.datetime(year + 1, 1, 1, tzinfo=CST).astimezone(UTC)
    first, last = iso(start), iso(end)
    observations, source_rows = [], []
    previous = None
    for row in csv.reader(iterator):
        if not row or not first <= row[0] <= last:
            continue
        if len(row) != len(FIELDS):
            raise ValueError('Malformed CSV row in requested subset')
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z', row[0]):
            raise ValueError('Expected an explicit UTC source timestamp')
        timestamp = dt.datetime.fromisoformat(row[0].replace('Z', '+00:00'))
        local = dt.datetime.strptime(row[1], '%Y-%m-%d %H:%M:%S').replace(tzinfo=CST)
        if local != timestamp:
            raise ValueError('Source UTC and station-calendar clocks disagree')
        if previous is not None and timestamp <= previous:
            raise ValueError('Duplicate or non-increasing native timestamp')
        previous = timestamp
        value = float(row[2]) if row[2] else None
        if value is not None and not math.isfinite(value):
            raise ValueError('Non-finite native value')
        grade = int(row[4])
        if grade not in GRADE_LABELS:
            raise ValueError(f'Unknown source grade: {grade}')
        if row[3] not in ('Approved', 'Reviewed', 'Preliminary'):
            raise ValueError(f'Unknown approval status: {row[3]}')
        observations.append({'time': row[0], 'value': value, 'approvalLevel': row[3],
                             'grade': grade, 'qualifiers': row[5]})
        source_rows.append(row)
    return observations, {'sourceGeneratedAt': generated.group(1).replace(' ', 'T') + 'Z',
                          'header': comments, 'units': expected_units,
                          'subsetStart': first, 'subsetEndInclusive': last}, source_rows


def derive_daily(observations: list[dict], year: int, excluded_dates=()) -> list[dict]:
    """Conservative trapezoid mean: both midnights, no >5-minute gap, usable grades.

    Irregular 3/5-minute observations are time-weighted. A point exactly at the
    following midnight is a boundary for the previous day, not a second interval.
    """
    by_date = collections.defaultdict(list)
    for row in observations:
        local = dt.datetime.fromisoformat(row['time'].replace('Z', '+00:00')).astimezone(CST)
        by_date[local.date()].append((local, row))
        if local.time() == dt.time():
            by_date[local.date() - dt.timedelta(days=1)].append((local, row))
    result = []
    date = dt.date(year, 1, 1)
    while date.year == year:
        start = dt.datetime.combine(date, dt.time(), CST)
        end = start + dt.timedelta(days=1)
        points = sorted(by_date[date], key=lambda pair: pair[0])
        statuses = sorted({row['approvalLevel'] for _, row in points})
        grades = sorted({row['grade'] for _, row in points})
        qualifiers = sorted({row['qualifiers'] for _, row in points if row['qualifiers']})
        gaps = [(b[0] - a[0]).total_seconds() for a, b in zip(points, points[1:])]
        reasons = []
        if date.isoformat() in excluded_dates:
            reasons.append('Station-level continuity break on this date')
        if not points or points[0][0] != start or points[-1][0] != end:
            reasons.append('Missing start or end midnight boundary')
        if any(gap <= 0 or gap > 300 for gap in gaps):
            reasons.append('Native interval gap exceeds five minutes or is non-increasing')
        if any(row['value'] is None for _, row in points):
            reasons.append('Missing native value')
        if set(grades) & EXCLUDED_GRADES:
            reasons.append('Unusable, undefined, ice, or partial-day source grade')
        if qualifiers:
            reasons.append('Nonblank source qualifier requires individual review')
        value = None
        if not reasons:
            value = sum((a[1]['value'] + b[1]['value']) / 2 * seconds
                        for a, b, seconds in zip(points, points[1:], gaps)) / 86400
        result.append({'date': date.isoformat(), 'value': value, 'sampleCount': len(points),
                       'maxIntervalSeconds': max(gaps, default=None), 'approvalLevels': statuses,
                       'grades': grades, 'qualifiers': qualifiers, 'excludedReasons': reasons})
        date += dt.timedelta(days=1)
    return result


def recover_station(station: str, year: int, output: Path) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    metadata, native_files, metrics = {}, {}, {}
    for kind, metric in [('Discharge', 'dischargeM3s'), ('Stage', 'levelM')]:
        index_url = f'{BASE}{kind}/corrected/{station[:2]}/'
        index, index_meta = fetch(index_url, 5_000_000)
        filenames = re.findall(r'href="([^"]+)"', index.decode('utf-8'))
        matches = [name for name in filenames
                   if re.fullmatch(rf'{kind}\.Working@{station}\.\d{{8}}_corrected\.csv\.xz', name)]
        if len(matches) > 1:
            raise ValueError(f'Ambiguous archive selection for {station} {kind}')
        if not matches:
            metadata[metric] = {'index': index_meta, 'status': 'not-listed'}
            metrics[metric] = derive_daily([], year)
            continue
        raw, source_meta = fetch(urllib.parse.urljoin(index_url, matches[0]))
        with lzma.open(io.BytesIO(raw), mode='rt', encoding='utf-8-sig', newline='') as source:
            observations, parsed, source_rows = parse_archive(source, station, kind, year)
        source_meta.update(parsed)
        source_meta['gradeCounts'] = dict(collections.Counter(row['grade'] for row in observations))
        source_meta['approvalCounts'] = dict(collections.Counter(row['approvalLevel'] for row in observations))
        source_meta['observationCount'] = len(observations)
        source_meta['status'] = 'available'
        metadata[metric] = source_meta
        native_name = f'{station}-{year}-{kind.lower()}.csv.xz'
        buffer = io.StringIO(newline='')
        buffer.write('\n'.join(parsed['header']) + '\n')
        writer = csv.writer(buffer, lineterminator='\n')
        writer.writerow(FIELDS)
        writer.writerows(source_rows)
        native = lzma.compress(buffer.getvalue().encode('utf-8'))
        (output / native_name).write_bytes(native)
        native_files[metric] = {'file': native_name, 'sha256': sha256(native), 'bytes': len(native),
                                'description': 'Native source field strings in the selected CST year, including following midnight boundary; original export header retained'}
        breaks = STATIONS[station]['levelContinuityBreaks'] if metric == 'levelM' else []
        metrics[metric] = derive_daily(observations, year, breaks)
    daily = []
    pairs = zip(metrics['dischargeM3s'], metrics['levelM']) if native_files else []
    for flow, stage in pairs:
        item = {'date': flow['date'], 'sourceType': 'derived-unit-values',
                'sourceProvider': 'ECCC unit archive', 'dischargeM3s': flow['value'], 'levelM': stage['value']}
        for prefix, value in [('discharge', flow), ('level', stage)]:
            item[prefix + 'Provenance'] = {key: entry for key, entry in value.items() if key not in ('date', 'value')}
            if value['value'] is not None:
                labels = [GRADE_LABELS[grade] for grade in value['grades'] if grade != -1]
                item[prefix + 'Qualifier'] = '; '.join(['RWP-derived daily mean', 'ECCC static provisional archive'] + value['approvalLevels'] + labels)
        daily.append(item)
    payload = {'station': station, 'name': STATIONS[station]['name'], 'year': year,
               'fetchedAt': iso(dt.datetime.now(UTC)), 'sourceType': 'derived-unit-values',
               'sourceProvider': 'ECCC unit archive', 'daily': daily,
               'status': 'available' if native_files else 'not-listed',
               'levelContinuityBreaks': STATIONS[station]['levelContinuityBreaks'],
               'sourceMetadata': metadata, 'nativeFiles': native_files,
               'method': {'timezone': 'America/Regina (UTC-06:00)',
                          'calculation': 'Trapezoidal integral of native instantaneous values / 86400 seconds',
                          'completeDayRequired': True, 'maxIntervalSeconds': 300,
                          'requiredBoundaries': 'Both station-calendar midnights',
                          'excludedGrades': sorted(EXCLUDED_GRADES),
                          'gradeDefinitions': GRADE_LABELS, 'gradeDefinitionsSource': DISCLAIMER,
                          'officialHydatDailyMean': False},
               'limitations': ['Static provisional archive; the generation time in each source header is the data vintage.',
                              'Approval levels and grades describe source observations; the daily aggregation is an RWP calculation, not an official HYDAT record.',
                              'Complete-day arithmetic does not establish gauge continuity, accuracy, or a safe comparison across a station relocation.',
                              'Missing or rejected days remain explicit null values; daily means do not describe flood peaks.'],
               'licence': 'Contains information licensed under the Open Government Licence – Canada'}
    destination = output / f'{station}-{year}.json'
    destination.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n')
    print(f'{destination}: {sum(row["dischargeM3s"] is not None for row in daily)} usable flow days; '
          f'{sum(row["levelM"] is not None for row in daily)} usable stage days')
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--station', choices=STATIONS, action='append', help='Repeat for multiple stations; default Birch')
    parser.add_argument('--year', type=int, default=2025)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'public/data/unit-history')
    args = parser.parse_args()
    if not 2011 <= args.year < dt.datetime.now(UTC).year:
        parser.error('--year must be a complete past calendar year from 2011 onward')
    for station in args.station or ['05MA011']:
        recover_station(station, args.year, args.output)


if __name__ == '__main__':
    main()
