import type { GeoProjection, GeoPath } from 'd3';
import { geoPath } from 'd3-geo';

/**
 * Union of GeoJSON-like objects that d3.geoPath accepts at runtime but
 * whose TypeScript types are too narrow to express in a single callable.
 */
export type GeoDrawable =
  | GeoJSON.GeoJsonObject
  | GeoJSON.Feature
  | GeoJSON.FeatureCollection
  | { type: 'Sphere' }
  | { type: 'LineString'; coordinates: [number, number][] }
  | GeoJSON.MultiPolygon
  | GeoJSON.MultiLineString;

export interface TypedGeoPath {
  (obj: GeoDrawable): string | null;
  context(ctx: CanvasRenderingContext2D): (obj: GeoDrawable) => void;
}

/**
 * Create a typed geoPath generator that encapsulates all `as any` casts
 * in a single place, so consumers work with `GeoDrawable` instead of `any`.
 * Optionally pass a canvas context so the path generator draws directly.
 */
export function createTypedGeoPath(projection: GeoProjection, ctx?: CanvasRenderingContext2D | null): TypedGeoPath {
  const raw: GeoPath = ctx ? geoPath(projection, ctx) : geoPath(projection);

  function draw(obj: GeoDrawable): string | null {
    return raw(obj as Parameters<typeof raw>[0]);
  }

  draw.context = function (ctx: CanvasRenderingContext2D): (obj: GeoDrawable) => void {
    const withCtx = raw.context(ctx);
    return (obj: GeoDrawable) => { withCtx(obj as Parameters<typeof withCtx>[0]); };
  };

  return draw as TypedGeoPath;
}