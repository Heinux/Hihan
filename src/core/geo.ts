import type { GeoProjection } from 'd3';

const SOUTHERN_TIMEZONES: readonly string[] = [
  'Pacific/Auckland',
  'Pacific/Fiji',
  'Pacific/Tongatapu',
  'Pacific/Samoa',
  'Pacific/Chatham',
  'Pacific/Efate',
  'Pacific/Guadalcanal',
  'Pacific/Noumea',
  'Pacific/Apia',
  'Pacific/Easter',
  'Pacific/Galapagos',
  'Pacific/Tahiti',
  'Pacific/Rarotonga',
  'Pacific/Niue',
  'Pacific/Pitcairn',
  'Pacific/Marquesas',
  'Pacific/Gambier',
  'Australia/Adelaide',
  'Australia/Brisbane',
  'Australia/Darwin',
  'Australia/Hobart',
  'Australia/Melbourne',
  'Australia/Perth',
  'Australia/Sydney',
  'Australia/Broken_Hill',
  'Australia/Eucla',
  'Australia/Lindeman',
  'Australia/Lord_Howe',
  'America/Sao_Paulo',
  'America/Buenos_Aires',
  'America/Santiago',
  'America/Montevideo',
  'America/Asuncion',
  'America/La_Paz',
  'America/Cordoba',
  'America/Argentina/Buenos_Aires',
  'America/Argentina/Catamarca',
  'America/Argentina/Cordoba',
  'America/Argentina/Jujuy',
  'America/Argentina/Mendoza',
  'America/Argentina/Rio_Gallegos',
  'America/Argentina/Salta',
  'America/Argentina/San_Juan',
  'America/Argentina/Tucuman',
  'America/Argentina/Ushuaia',
  'America/Cuiaba',
  'America/Belem',
  'America/Fortaleza',
  'America/Recife',
  'America/Noronha',
  'America/Punta_Arenas',

  'Africa/Johannesburg',
  'Africa/Maputo',
  'Africa/Harare',
  'Africa/Lusaka',
  'Africa/Windhoek',
  'Africa/Gaborone',
  'Africa/Maseru',
  'Africa/Mbabane',
  'Africa/Luanda',
  'Africa/Kinshasa',
  'Africa/Lubumbashi',
  'Africa/Dar_es_Salaam',
  'Africa/Nairobi',
  'Africa/Kampala',
  'Africa/Blantyre',
  'Africa/Mogadishu',
  'Africa/Mayotte',
  'Africa/Antananarivo',
  'Indian/Mauritius',
  'Indian/Reunion',
  'Indian/Maldives',
  'Indian/Christmas',
  'Indian/Cocos',
  'Indian/Comoro',
  'Indian/Kerguelen',
  'Indian/Mahe',
  'Indian/Mayotte',
  'Antarctica/McMurdo',
  'Antarctica/South_Pole',
  'Antarctica/Casey',
  'Antarctica/Davis',
  'Antarctica/DumontDUrville',
  'Antarctica/Mawson',
  'Antarctica/Palmer',
  'Antarctica/Rothera',
  'Antarctica/Syowa',
  'Antarctica/Vostok',
  'Atlantic/South_Georgia',
  'Atlantic/Stanley',
  'Atlantic/Cape_Verde',
] as const;

const NORTHERN_PACIFIC_EXCEPTIONS: readonly string[] = [
  'Pacific/Honolulu',
  'Pacific/Midway',
  'Pacific/Wake',
  'Pacific/Guam',
  'Pacific/Palau',
  'Pacific/Port_Moresby',
  'Pacific/Tarawa',
  'Pacific/Majuro',
  'Pacific/Kwajalein',
  'Pacific/Ponape',
  'Pacific/Truk',
  'Pacific/Yap',
  'Pacific/Johnston',
  'Pacific/Enderbury',
  'Pacific/Funafuti',
  'Pacific/Nauru',
  'Pacific/Norfolk',
  'Pacific/Pago_Pago',
  'Pacific/Saipan',
] as const;

/**
 * Detects the user's hemisphere based on timezone.
 *
 * @returns 'N' for northern hemisphere, 'S' for southern hemisphere
 */
export function detectHemisphere(): 'N' | 'S' {
  let tz = '';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    // no-op
  }

  if (tz) {
    // Check southern first (exact match)
    for (const entry of SOUTHERN_TIMEZONES) {
      if (tz === entry || tz.startsWith(entry + '/')) return 'S';
    }
    // Check known northern Pacific exceptions
    for (const entry of NORTHERN_PACIFIC_EXCEPTIONS) {
      if (tz === entry) return 'N';
    }
  }

  // Fallback: compare timezone offsets between January and July
  const jan = new Date(new Date().getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(new Date().getFullYear(), 6, 1).getTimezoneOffset();
  if (jan > jul) return 'S';

  return 'N';
}

export interface ViewportLike {
  W: number;
  H: number;
  panX: number;
  panY: number;
  zoomK: number;
  viewScale: number;
}

/** Convert screen coordinates to geographic [lon, lat] by inverting
 *  the viewport transform + d3 projection. Returns null if outside the projection domain. */
export function screenToGeo(
  screenX: number,
  screenY: number,
  projection: GeoProjection,
  viewport: ViewportLike,
): [number, number] | null {
  const { W, H, panX, panY, zoomK, viewScale: vs } = viewport;
  const Wv = W / vs, Hv = H / vs;
  const vx = screenX / vs;
  const vy = screenY / vs;
  const projX = (vx - Wv / 2 - panX / vs) / zoomK + Wv / 2;
  const projY = (vy - Hv / 2 - panY / vs) / zoomK + Hv / 2;
  const geo = projection.invert?.([projX, projY]);
  if (!geo || isNaN(geo[0]) || isNaN(geo[1])) return null;
  return geo as [number, number];
}
