// ── Wind grid data — GFS surface wind field for particle visualization ──
// Binary format decoder and bilinear interpolation for 1° global grid.

export interface WindGridConfig {
  width: number;
  height: number;
  u: Float32Array;
  v: Float32Array;
  timestamp: number;
  source: string;
}

export class WindGrid {
  readonly width: number;
  readonly height: number;
  readonly u: Float32Array;
  readonly v: Float32Array;
  readonly timestamp: number;
  readonly source: string;

  private readonly latStep: number;
  private readonly lonStep: number;

  constructor(config: WindGridConfig) {
    this.width = config.width;
    this.height = config.height;
    this.u = config.u;
    this.v = config.v;
    this.timestamp = config.timestamp;
    this.source = config.source;
    this.latStep = 180 / (this.height - 1);
    this.lonStep = 360 / (this.width - 1);
  }

  /** Bilinear interpolation of wind velocity at geographic coordinates. */
  interpolate(lat: number, lon: number): { u: number; v: number } {
    // Normalize lon to [0, 360) and clamp lat
    const lonNorm = ((lon % 360) + 360) % 360;
    const latNorm = Math.max(-90, Math.min(90, lat));

    // Grid indices (floating point)
    const fx = lonNorm / this.lonStep;
    const fy = (90 - latNorm) / this.latStep;

    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = (x0 + 1) % this.width;
    const y1 = Math.min(y0 + 1, this.height - 1);

    const tx = fx - x0;
    const ty = fy - y0;

    const idx00 = y0 * this.width + x0;
    const idx10 = y0 * this.width + x1;
    const idx01 = y1 * this.width + x0;
    const idx11 = y1 * this.width + x1;

    const u = (1 - tx) * (1 - ty) * this.u[idx00] + tx * (1 - ty) * this.u[idx10]
            + (1 - tx) * ty * this.u[idx01] + tx * ty * this.u[idx11];
    const v = (1 - tx) * (1 - ty) * this.v[idx00] + tx * (1 - ty) * this.v[idx10]
            + (1 - tx) * ty * this.v[idx01] + tx * ty * this.v[idx11];

    return { u, v };
  }

  /** Linearly interpolate wind velocity between two temporal grids. */
  static interpolateTemporal(
    gridA: WindGrid,
    gridB: WindGrid,
    t: number,
    lat: number,
    lon: number,
  ): { u: number; v: number } {
    const a = gridA.interpolate(lat, lon);
    const b = gridB.interpolate(lat, lon);
    return {
      u: a.u + (b.u - a.u) * t,
      v: a.v + (b.v - a.v) * t,
    };
  }

  /** Random lat/lon weighted toward more visible latitudes (avoids polar singularity). */
  randomPoint(): { lat: number; lon: number } {
    // Uniform random longitude, cosine-weighted latitude for even area distribution
    const lat = Math.asin(Math.random() * 2 - 1) * (180 / Math.PI);
    const lon = Math.random() * 360 - 180;
    return { lat, lon };
  }

  /** Decode binary wind grid from ArrayBuffer. */
  static decode(buffer: ArrayBuffer): WindGrid {
    const view = new DataView(buffer);

    // Magic bytes: "WIND" = 0x57494E44
    const magic = view.getUint32(0, false);
    if (magic !== 0x57494e44) {
      throw new Error(`Invalid wind data magic: 0x${magic.toString(16)}`);
    }

    const version = view.getUint16(4, false);
    if (version !== 1) {
      throw new Error(`Unsupported wind data version: ${version}`);
    }

    const width = view.getUint16(6, false);
    const height = view.getUint16(8, false);
    // Reserved: view.getUint16(10, false)
    const timestamp = view.getFloat64(12, false);

    const sourceLen = view.getUint8(20);
    const sourceBytes = new Uint8Array(buffer, 21, sourceLen);
    const source = new TextDecoder().decode(sourceBytes);

    const headerSize = 56;
    const gridSize = width * height;
    const u = new Float32Array(buffer, headerSize, gridSize);
    const v = new Float32Array(buffer, headerSize + gridSize * 4, gridSize);

    return new WindGrid({ width, height, u, v, timestamp, source });
  }

  /** Fetch and decode the latest wind grid from the static data URL. */
  static async fetchLatest(url: string): Promise<WindGrid> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch wind data: ${response.status} ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    return WindGrid.decode(buffer);
  }
}