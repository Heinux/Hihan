import type { GeoProjection } from 'd3';
import { geoAzimuthalEquidistant, geoStereographic, geoOrthographic, geoGnomonic } from 'd3-geo';

export const PROJECTIONS: Record<string, { id: string; name: string; description: string; create(): GeoProjection }> = {
  azimuthalEquidistant: {
    id: 'azimuthalEquidistant',
    name: 'Azimutale equidistante',
    description: 'Projection par defaut — conserve les distances depuis le pole',
    create() {
      return geoAzimuthalEquidistant()
        .precision(0.5)
        .clipAngle(180);
    },
  },
  stereographic: {
    id: 'stereographic',
    name: 'Stereographique',
    description: 'Projection conforme — conserve les angles',
    create() {
      return geoStereographic()
        .precision(0.5)
        .clipAngle(180);
    },
  },
  orthographic: {
    id: 'orthographic',
    name: 'Orthographique',
    description: 'Vue 3D depuis l\'infini',
    create() {
      return geoOrthographic()
        .precision(0.5)
        .clipAngle(90);
    },
  },
  gnomonic: {
    id: 'gnomonic',
    name: 'Gnomonique',
    description: 'Les grands cercles sont des lignes droites',
    create() {
      return geoGnomonic()
        .precision(0.5)
        .clipAngle(89);
    },
  },
};

export function getProjection(id: string = 'azimuthalEquidistant'): GeoProjection {
  const strategy = PROJECTIONS[id];
  if (!strategy) {
    console.warn(`[projections] Unknown projection "${id}", falling back to azimuthalEquidistant`);
    return PROJECTIONS.azimuthalEquidistant.create();
  }
  return strategy.create();
}
