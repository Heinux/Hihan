/**
 * world-topo.ts
 * Les donnees TopoJSON monde sont trop volumineuses (~108 Ko) pour un module inline.
 * Elles restent dans index.html comme constante WORLD_DATA et sont converties en GeoJSON
 * via topojson.feature().
 *
 * Ce module fournit la fonction d'initialisation qui transforme les donnees brutes
 * en features GeoJSON utilisables par d3.
 */

import * as topojson from 'topojson-client';
import type { Topology } from 'topojson-specification';

export function initWorldData(rawTopoJSON: Topology): GeoJSON.FeatureCollection {
  return topojson.feature(rawTopoJSON, rawTopoJSON.objects.countries) as GeoJSON.FeatureCollection;
}
