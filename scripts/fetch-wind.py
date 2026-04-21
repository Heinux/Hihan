#!/usr/bin/env python3
"""Fetch GFS 1-degree surface wind data and encode as binary for Hihan.

Supports two modes:
  1. Current: Downloads from NOMADS GRIB2 filter (latest run, ~2 week window)
  2. Archive:  Downloads from NCEI THREDDS OPeNDAP (GFS analysis, 2004–2023)

Usage:
    pip install requests numpy
    python fetch-wind.py                          # latest run from NOMADS
    python fetch-wind.py --archive 2020-03-15     # specific date from NCEI
    python fetch-wind.py --archive-range 2015-01-01 2015-12-31  # batch

Output:
    static/wind/gfs-current.bin  - Binary wind grid data (~520KB)
    static/wind/gfs-current.json - Metadata (timestamp, source, grid dims)
    static/wind/archive/YYYYMMDD-HH.bin  - Archive wind data (per-date)
"""

import struct
import json
import sys
import os
import argparse
from datetime import datetime, timedelta, timezone
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

# Try numpy first, fall back to pure-python if unavailable
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

# GFS 1-degree grid dimensions
GRID_WIDTH = 360
GRID_HEIGHT = 181

# Binary format constants
MAGIC = b'WIND'
VERSION = 1
HEADER_SIZE = 56

# NOMADS base URLs
NOMADS_BASE = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
GFS_1DEG_BASE = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl"


def find_latest_gfs_run() -> tuple[str, str]:
    """Find the most recent available GFS run date and hour."""
    now = datetime.now(timezone.utc)
    # GFS runs at 00, 06, 12, 18 UTC; data is typically available 3-4 hours after
    for offset_hours in range(0, 48, 6):
        check_time = now - timedelta(hours=offset_hours)
        date_str = check_time.strftime("%Y%m%d")
        hour_str = f"{check_time.hour // 6 * 6:02d}"
        return date_str, hour_str
    # Fallback
    now = datetime.now(timezone.utc)
    return now.strftime("%Y%m%d"), "00"


def fetch_gfs_binary(date_str: str, hour_str: str) -> bytes:
    """Fetch GFS 1-degree GRIB2 data for surface wind components."""
    url = (
        f"{GFS_1DEG_BASE}"
        f"?file=gfs.t{hour_str}z.pgrb2.1p00.f000"
        f"&lev_10_m_above_ground=on"
        f"&var_UGRD=on&var_VGRD=on"
        f"&leftlon=0&rightlon=359&toplat=90&bottomlat=-90"
        f"&dir=%2Fgfs.{date_str}%2F{hour_str}%2Fatmos"
    )
    print(f"Fetching: {url}")
    req = Request(url, headers={"User-Agent": "Hihan-WindFetcher/1.0"})
    try:
        with urlopen(req, timeout=60) as resp:
            data = resp.read()
        print(f"Downloaded {len(data)} bytes of GRIB2 data")
        return data
    except (URLError, HTTPError) as e:
        print(f"Error fetching GFS data: {e}")
        sys.exit(1)


def try_opendap_decode(date_str: str, hour_str: str) -> tuple:
    """Try to fetch wind data via NOMADS OpenDAP ASCII subset.

    Returns (u_array, v_array, timestamp) or raises.
    Uses the 1-degree GFS OpenDAP interface.
    """
    base_url = f"https://nomads.ncep.noaa.gov/dods/gfs_0p25/gfs{date_str}/gfs_0p25_{hour_str}z.ascii"
    # Fetch U component
    u_url = f"{base_url}?ugrd10m[0][0:360:181][0:360:360]"
    v_url = f"{base_url}?vgrd10m[0][0:360:181][0:360:360]"
    print(f"Fetching OpenDAP: {u_url[:80]}...")
    # This approach requires parsing ASCII output - more complex
    raise NotImplementedError("OpenDAP parsing not yet implemented")


def generate_placeholder_grid() -> tuple:
    """Generate a simple climatological wind pattern as placeholder.

    Uses trade wind and westerly patterns for a visually interesting
    initial state before real GFS data is available.
    """
    if HAS_NUMPY:
        lats = np.linspace(90, -90, GRID_HEIGHT)
        lons = np.linspace(0, 359, GRID_WIDTH)
        lon_grid, lat_grid = np.meshgrid(lons, lats)

        # Trade winds: easterlies in tropics (0-30°), westerlies in mid-latitudes (30-60°)
        lat_rad = np.radians(lat_grid)
        u = np.where(
            np.abs(lat_grid) < 30,
            -5 * np.cos(lat_rad),  # Easterly trade winds
            np.where(
                np.abs(lat_grid) < 60,
                5 * np.cos(lat_rad),   # Westerlies
                -2 * np.cos(lat_rad)   # Polar easterlies
            )
        )
        # Meridional: slight poleward in tropics, equatorward in mid-latitudes
        v = np.where(
            lat_grid > 0,
            np.where(np.abs(lat_grid) < 30, -1.5, 1.0),
            np.where(np.abs(lat_grid) < 30, 1.5, -1.0)
        )
        # Add some gentle wave pattern for visual interest
        u += 2 * np.sin(np.radians(lon_grid * 2 + lat_grid * 3))
        v += 1.5 * np.cos(np.radians(lon_grid * 3 - lat_grid * 2))

        timestamp = datetime.now(timezone.utc).timestamp()
        return u.flatten().astype(np.float32), v.flatten().astype(np.float32), timestamp
    else:
        # Pure-python fallback
        u = []
        v = []
        timestamp = datetime.now(timezone.utc).timestamp()
        for iy in range(GRID_HEIGHT):
            lat = 90 - iy * (180 / (GRID_HEIGHT - 1))
            for ix in range(GRID_WIDTH):
                lon = ix * (360 / (GRID_WIDTH - 1))
                lat_rad = lat * 3.14159265 / 180
                abs_lat = abs(lat)
                if abs_lat < 30:
                    u_val = -5 * abs(lat_rad) + 2 * (1 if lat >= 0 else -1) * lat_rad
                    v_val = -1.5 if lat > 0 else 1.5
                elif abs_lat < 60:
                    u_val = 5 * abs(lat_rad)
                    v_val = 1.0 if lat > 0 else -1.0
                else:
                    u_val = -2 * abs(lat_rad)
                    v_val = 0.5
                u_val += 2 * (3.14159265 / 180) * (lon * 2 + lat * 3)
                v_val += 1.5 * (3.14159265 / 180) * (lon * 3 - lat * 2)
                u.append(u_val)
                v.append(v_val)
        import array
        u_arr = array.array('f', u)
        v_arr = array.array('f', v)
        return u_arr, v_arr, timestamp


def encode_binary(u_data, v_data, timestamp: float, source: str = "placeholder") -> bytes:
    """Encode wind grid data into the binary format.

    Format:
        4 bytes  - Magic: "WIND" (0x57494E44)
        2 bytes  - Version: 1
        2 bytes  - Grid width (uint16)
        2 bytes  - Grid height (uint16)
        2 bytes  - Reserved
        8 bytes  - Forecast timestamp (float64, Unix epoch)
        1 byte   - Source string length
        31 bytes - Source string (padded)
        ---      - U component Float32Array[width*height]
        ---      - V component Float32Array[width*height]
    """
    source_bytes = source.encode('ascii')[:31]
    source_padded = source_bytes + b'\x00' * (31 - len(source_bytes))

    header = struct.pack('>4sHHHhd', MAGIC, VERSION, GRID_WIDTH, GRID_HEIGHT, 0, timestamp)
    header += struct.pack('B', len(source_bytes))
    header += source_padded
    # Pad header to 56 bytes
    header += b'\x00' * (HEADER_SIZE - len(header))

    if HAS_NUMPY:
        u_bytes = u_data.tobytes()
        v_bytes = v_data.tobytes()
    else:
        u_bytes = u_data.tobytes() if hasattr(u_data, 'tobytes') else bytes(u_data)
        v_bytes = v_data.tobytes() if hasattr(v_data, 'tobytes') else bytes(v_data)

    return header + u_bytes + v_bytes


def main():
    output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'static', 'wind')
    os.makedirs(output_dir, exist_ok=True)

    bin_path = os.path.join(output_dir, 'gfs-current.bin')
    json_path = os.path.join(output_dir, 'gfs-current.json')

    # Try fetching real GFS data
    try:
        date_str, hour_str = find_latest_gfs_run()
        print(f"Attempting GFS data for {date_str} {hour_str}Z...")
        grib_data = fetch_gfs_binary(date_str, hour_str)

        # If we got here, we have GRIB2 data but need to decode it
        # For now, fall through to placeholder since GRIB2 decoding
        # requires pygrib or cfgrib which may not be installed
        print("GRIB2 data downloaded but decoding requires pygrib/cfgrib")
        print("Falling back to placeholder data...")
        raise RuntimeError("GRIB2 decoding not implemented in this version")
    except Exception as e:
        print(f"GFS fetch/decode failed: {e}")
        print("Generating placeholder climatological wind data...")

    # Generate placeholder data
    u_data, v_data, timestamp = generate_placeholder_grid()

    # Encode to binary
    binary_data = encode_binary(u_data, v_data, timestamp, source="placeholder-climatology")
    with open(bin_path, 'wb') as f:
        f.write(binary_data)
    print(f"Wrote {len(binary_data)} bytes to {bin_path}")

    # Write metadata JSON
    metadata = {
        "timestamp": timestamp,
        "timestamp_iso": datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat(),
        "source": "placeholder-climatology",
        "gridWidth": GRID_WIDTH,
        "gridHeight": GRID_HEIGHT,
        "forecastHour": 0,
    }
    with open(json_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"Wrote metadata to {json_path}")

    print("Done! Place gfs-current.bin in your static/wind/ directory.")


# ── AWS S3 GFS Data Access ──────────────────────────────────────────────
# AWS Open Data bucket noaa-gfs-bdp-pds has full GFS 0.25° data from 2021-01-01.
# Uses GRIB2 .idx files for efficient partial downloads via HTTP Range requests.

AWS_S3_BASE = "https://noaa-gfs-bdp-pds.s3.amazonaws.com"
AWS_MIN_DATE = "20210101"
AWS_PATH_CHANGE_DATE = "20210323"  # GFS v16.3.0: path changed to include /atmos/


def fetch_aws_wind(date_str: str, hour: int = 0) -> tuple:
    """Fetch wind data from AWS S3 Open Data for dates from 2021+.

    Uses GRIB2 idx + HTTP Range requests to download only UGRD/VGRD at 10m,
    then decodes the partial GRIB2 data.

    Args:
        date_str: Date in YYYYMMDD format (must be >= 20210101)
        hour: UTC hour (0, 6, 12, or 18; snapped to nearest cycle)

    Returns:
        (u_array, v_array, timestamp, source_str) or raises on failure.
    """
    if date_str < AWS_MIN_DATE:
        raise ValueError(f"AWS S3 data only available from {AWS_MIN_DATE}, got {date_str}")

    cycle = str((hour // 6) * 6).zfill(2)

    # Build base URL (path format changed on 2021-03-23)
    if date_str >= AWS_PATH_CHANGE_DATE:
        base_url = f"{AWS_S3_BASE}/gfs.{date_str}/{cycle}/atmos/gfs.t{cycle}z.pgrb2.0p25.f000"
    else:
        base_url = f"{AWS_S3_BASE}/gfs.{date_str}/{cycle}/gfs.t{cycle}z.pgrb2.0p25.f000"

    idx_url = base_url + ".idx"
    print(f"Fetching AWS S3 idx: {idx_url[:100]}...")

    # 1. Fetch and parse the idx file
    req = Request(idx_url, headers={"User-Agent": "Hihan-WindFetcher/1.0"})
    with urlopen(req, timeout=15) as resp:
        idx_text = resp.read().decode("utf-8")

    # Parse idx to find UGRD/VGRD at 10m
    u_entry = None
    v_entry = None
    lines = [l.strip() for l in idx_text.split("\n") if l.strip()]
    for i, line in enumerate(lines):
        parts = line.split(":")
        if len(parts) < 4:
            continue
        byte_start = int(parts[1])
        # Compute byte_end from next entry's offset or use generous upper bound
        if i + 1 < len(lines):
            next_parts = lines[i + 1].split(":")
            byte_end = int(next_parts[1])
        else:
            byte_end = byte_start + 5_000_000

        has_ugrd = "UGRD" in parts
        has_vgrd = "VGRD" in parts
        has_10m = any("10 m above ground" in p for p in parts)

        if has_ugrd and has_10m and u_entry is None:
            u_entry = (byte_start, byte_end)
        if has_vgrd and has_10m and v_entry is None:
            v_entry = (byte_start, byte_end)

    if not u_entry or not v_entry:
        raise RuntimeError(f"AWS S3: no 10m wind in idx (UGRD={u_entry is not None}, VGRD={v_entry is not None})")

    # 2. Merge overlapping ranges and download via HTTP Range requests
    ranges = sorted([u_entry, v_entry], key=lambda r: r[0])
    merged = [ranges[0]]
    for r in ranges[1:]:
        if r[0] <= merged[-1][1] + 1:
            merged[-1] = (merged[-1][0], max(merged[-1][1], r[1]))
        else:
            merged.append(r)

    chunks = []
    for start, end in merged:
        range_header = f"bytes={start}-{end - 1}"
        print(f"  AWS S3 range: {range_header}")
        req = Request(base_url, headers={
            "User-Agent": "Hihan-WindFetcher/1.0",
            "Range": range_header,
        })
        with urlopen(req, timeout=30) as resp:
            chunks.append(resp.read())

    # 3. Concatenate and decode GRIB2
    grib_data = b"".join(chunks)

    # Use numpy for decoding if available, otherwise fall back to placeholder
    # For now, use the placeholder approach since GRIB2 decoding requires struct
    # In the production serverless function, the full GRIB2 decoder handles this.
    # For the Python script, we use a simpler approach: download and save raw data.
    source = f"aws-gfs0p25-{date_str}-{cycle}z-f000"
    timestamp = datetime.now(timezone.utc).timestamp()
    print(f"  Downloaded {len(grib_data)} bytes from AWS S3")

    # Try to decode using numpy-based GRIB2 decoding
    # This requires the full GRIB2 message parsing - for the Python script,
    # we'll save the raw data and let the serverless function handle decoding.
    # For now, raise an error since full GRIB2 decoding is complex in Python.
    # The serverless function (wind.ts) has the complete decoder.
    raise NotImplementedError(
        "AWS S3 GRIB2 decoding not implemented in Python script. "
        "Use the serverless function (/api/wind) for 2021+ dates instead."
    )


# ── NCEI Archive Fetching ──────────────────────────────────────────────

NCEI_BASE = "https://www.ncei.noaa.gov/thredds/dodsC"
NCEI_HTTPS_BASE = "https://www.ncei.noaa.gov/data/global-forecast-system/access/grid-004-0.5-degree/analysis"
NCEI_CATALOGS = [
    {"suffix": "", "min_date": "20200501"},       # "current" catalog (2020-05 to 2023-11)
    {"suffix": "-old", "min_date": "20040301"},    # "old" catalog (2004-03 to 2020-05)
]


def fetch_ncei_direct_wind(date_str: str, hour: int = 0) -> tuple:
    """Fetch wind data from NCEI direct HTTPS for pre-2021 dates.

    Downloads the full Grid 4 (0.5°) analysis GRIB2 file and decodes wind components.
    Falls back to this when AWS S3 is not available (pre-2021).

    Args:
        date_str: Date in YYYYMMDD format
        hour: UTC hour (0, 6, 12, or 18; snapped to nearest cycle)

    Returns:
        (u_array, v_array, timestamp, source_str) or raises on failure.
    """
    year = date_str[:4]
    cycle_hhmm = str((hour // 6) * 6 * 100).zfill(4)
    url = f"{NCEI_HTTPS_BASE}/{year}/{date_str}/gfsanl_4_{date_str}_{cycle_hhmm}_000.grb2"

    print(f"Trying NCEI direct: {url[:100]}...")

    # HEAD request to check availability and size
    req = Request(url, method="HEAD", headers={"User-Agent": "Hihan-WindFetcher/1.0"})
    try:
        with urlopen(req, timeout=10) as resp:
            content_length = int(resp.headers.get("Content-Length", 0))
            if content_length > 50_000_000:  # 50MB max
                raise RuntimeError(f"NCEI file too large: {content_length} bytes")
    except (URLError, HTTPError) as e:
        raise RuntimeError(f"NCEI direct not available: {e}")

    # Download the full file
    req = Request(url, headers={"User-Agent": "Hihan-WindFetcher/1.0"})
    with urlopen(req, timeout=60) as resp:
        data = resp.read()

    print(f"  Downloaded {len(data)} bytes from NCEI direct")

    # Decode GRIB2 - requires struct-based decoder (similar to wind.ts)
    # For the Python script, we save raw data and note that full GRIB2
    # decoding is handled by the serverless function.
    source = f"ncei-gfs4-{date_str}-{str((hour // 6) * 6).zfill(2)}z"
    timestamp = datetime.now(timezone.utc).timestamp()

    raise NotImplementedError(
        "NCEI direct GRIB2 decoding not implemented in Python script. "
        "Use the serverless function (/api/wind) for historical dates instead."
    )


def fetch_ncei_wind(date_str: str, hour: int = 0) -> tuple:
    """Fetch wind data from NCEI THREDDS OPeNDAP for a historical date.

    Args:
        date_str: Date in YYYYMMDD format
        hour: UTC hour (0, 6, 12, or 18; snapped to nearest cycle)

    Returns:
        (u_array, v_array, timestamp, source_str) or raises on failure.
    """
    hour4 = str((hour // 6) * 6).zfill(4)

    for catalog in NCEI_CATALOGS:
        if date_str < catalog["min_date"]:
            continue

        catalog_path = f"model-gfs-g4-anl-files{catalog['suffix']}"
        ym = date_str[:6]
        url = (
            f"{NCEI_BASE}/{catalog_path}/{ym}/{date_str}"
            f"/gfsanl_4_{date_str}_{hour4}_000.grb2.ascii"
            f"?u-component_of_wind_height_above_ground[0][0][0:2:360][0:2:719]"
            f"&v-component_of_wind_height_above_ground[0][0][0:2:360][0:2:719]"
        )
        print(f"Fetching NCEI OPeNDAP: {url[:120]}...")

        try:
            req = Request(url, headers={"User-Agent": "Hihan-WindFetcher/1.0"})
            with urlopen(req, timeout=30) as resp:
                text = resp.read().decode("utf-8")

            parsed = parse_opendap_ascii(text)
            if parsed is None:
                print(f"NCEI OPeNDAP parse failed for catalog {catalog['suffix'] or 'current'}")
                continue

            u_arr, v_arr = parsed
            cycle = str((hour // 6) * 6).zfill(2)
            source = f"ncei-gfs4-{date_str}-{cycle}z"
            timestamp = datetime.now(timezone.utc).timestamp()
            return u_arr, v_arr, timestamp, source

        except (URLError, HTTPError) as e:
            print(f"NCEI catalog {catalog['suffix'] or 'current'} failed: {e}")
            continue

    raise RuntimeError(f"No NCEI archive data available for {date_str}")


def parse_opendap_ascii(text: str) -> tuple | None:
    """Parse OPeNDAP ASCII response for wind components.

    Returns (u_flat, v_flat) as flat arrays in row-major order
    (lat from 90 to -90, lon from 0 to 359) or None on failure.
    """
    u_marker = "u-component_of_wind_height_above_ground.u-component_of_wind_height_above_ground"
    v_marker = "v-component_of_wind_height_above_ground.v-component_of_wind_height_above_ground"

    u_start = text.find(u_marker)
    v_start = text.find(v_marker)
    if u_start < 0 or v_start < 0:
        return None

    u_section = text[u_start:v_start]
    v_section = text[v_start:]

    u_arr = _parse_variable(u_section)
    v_arr = _parse_variable(v_section)

    if u_arr is None or v_arr is None:
        return None

    return u_arr, v_arr


def _parse_variable(section: str) -> list | None:
    """Parse one variable section from OPeNDAP ASCII format.

    Each data row looks like: [0][0][N], val1, val2, val3, ...
    Returns a flat list of GRID_WIDTH * GRID_HEIGHT floats, or None.
    """
    import re
    result = [0.0] * (GRID_WIDTH * GRID_HEIGHT)
    row_pattern = re.compile(r'^\[0\]\[0\]\[(\d+)\],\s*(.*)')

    for line in section.split("\n"):
        m = row_pattern.match(line.strip())
        if not m:
            continue
        lat_idx = int(m.group(1))
        if lat_idx < 0 or lat_idx >= GRID_HEIGHT:
            continue
        values = [float(v.strip()) for v in m.group(2).split(",")]
        for i, val in enumerate(values):
            if i >= GRID_WIDTH:
                break
            if val == float("inf") or val == float("-inf") or val != val:  # skip NaN/Inf
                continue
            result[lat_idx * GRID_WIDTH + i] = val

    return result


def archive_date(date_str: str, hour: int = 0, output_dir: str = None):
    """Fetch a single historical date and save to archive directory.

    Tries sources in order: AWS S3 (2021+), NCEI direct HTTPS, NCEI OPeNDAP.
    """
    if output_dir is None:
        output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", "wind", "archive")
    os.makedirs(output_dir, exist_ok=True)

    cycle = str((hour // 6) * 6).zfill(2)
    bin_path = os.path.join(output_dir, f"{date_str}-{cycle}.bin")
    json_path = os.path.join(output_dir, f"{date_str}-{cycle}.json")

    u_data = v_data = None
    timestamp = None
    source = None

    # Try AWS S3 first for 2021+ dates
    if date_str >= AWS_MIN_DATE:
        try:
            u_data, v_data, timestamp, source = fetch_aws_wind(date_str, hour)
        except Exception as e:
            print(f"AWS S3 failed: {e}")

    # Try NCEI direct HTTPS for pre-2021 dates
    if u_data is None and date_str < AWS_MIN_DATE:
        try:
            u_data, v_data, timestamp, source = fetch_ncei_direct_wind(date_str, hour)
        except Exception as e:
            print(f"NCEI direct failed: {e}")

    # Try NCEI OPeNDAP as last resort
    if u_data is None:
        u_data, v_data, timestamp, source = fetch_ncei_wind(date_str, hour)

    if HAS_NUMPY:
        u_bytes = u_data.tobytes() if isinstance(u_data, np.ndarray) else bytes(u_data)
        v_bytes = v_data.tobytes() if isinstance(v_data, np.ndarray) else bytes(v_data)
    else:
        import array
        u_bytes = u_data.tobytes() if hasattr(u_data, 'tobytes') else bytes(u_data)
        v_bytes = v_data.tobytes() if hasattr(v_data, 'tobytes') else bytes(v_data)

    binary_data = encode_binary(u_data, v_data, timestamp, source=source)
    with open(bin_path, "wb") as f:
        f.write(binary_data)
    print(f"Wrote {len(binary_data)} bytes to {bin_path}")

    metadata = {
        "timestamp": timestamp,
        "timestamp_iso": datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat(),
        "source": source,
        "gridWidth": GRID_WIDTH,
        "gridHeight": GRID_HEIGHT,
        "forecastHour": 0,
    }
    with open(json_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"Wrote metadata to {json_path}")


def archive_range(start_date: str, end_date: str, output_dir: str = None, hours: list = None):
    """Fetch a range of dates from NCEI and save to archive directory.

    Args:
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format
        output_dir: Output directory (default: static/wind/archive)
        hours: List of UTC hours to fetch (default: [0, 6, 12, 18])
    """
    if hours is None:
        hours = [0, 6, 12, 18]

    start = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    end = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)

    current = start
    while current <= end:
        date_str = current.strftime("%Y%m%d")
        for h in hours:
            try:
                archive_date(date_str, h, output_dir)
            except Exception as e:
                print(f"Failed {date_str} {h:02d}Z: {e}")
                continue
        current += timedelta(days=1)

    print(f"Archive range complete: {start_date} to {end_date}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Fetch GFS wind data for Hihan")
    parser.add_argument("--archive", metavar="YYYY-MM-DD", help="Fetch archive data for a specific date from NCEI")
    parser.add_argument("--archive-range", nargs=2, metavar=("START", "END"), help="Fetch archive data for a date range from NCEI")
    parser.add_argument("--hour", type=int, default=0, help="UTC hour for archive fetch (0, 6, 12, or 18)")
    parser.add_argument("--output-dir", help="Output directory for archive files")
    args = parser.parse_args()

    if args.archive:
        date_str = args.archive.replace("-", "")
        archive_date(date_str, args.hour, args.output_dir)
    elif args.archive_range:
        start = args.archive_range[0]
        end = args.archive_range[1]
        archive_range(start, end, args.output_dir, hours=[args.hour])
    else:
        main()