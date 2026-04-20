#!/usr/bin/env python3
"""Fetch GFS 1-degree surface wind data and encode as binary for Hihan.

Downloads UGRD and VGRD at 10m above ground from the latest GFS run,
encodes them as a flat binary file for client-side consumption.

Usage:
    pip install requests numpy
    python fetch-wind.py

Output:
    static/wind/gfs-current.bin  - Binary wind grid data (~520KB)
    static/wind/gfs-current.json  - Metadata (timestamp, source, grid dims)
"""

import struct
import json
import sys
import os
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


if __name__ == '__main__':
    main()