// ── Celestial Planisphere — Constants ─────────────────────────────────

// ── Interfaces ────────────────────────────────────────────────────────

export interface CelestialBody {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly radius: number;
  readonly glow: number;
  readonly labelOffset: readonly [number, number];
}

export interface ZodiacSign {
  readonly symbol: string;
  readonly name: string;
  readonly eclLon: number;
}

export interface SeasonDef {
  readonly key: string;
  readonly eclLon: number;
  readonly symbol: string;
  readonly label: string;
  readonly sub: string;
  readonly color: string;
  readonly glowColor: string;
  readonly markerR: number;
}

export interface EventLabel {
  readonly label: string;
  readonly symbol: string;
  readonly color: string;
}

export interface EventLabelsMap {
  readonly vernal: EventLabel;
  readonly summer: EventLabel;
  readonly autumnal: EventLabel;
  readonly winter: EventLabel;
}

export interface EnochMonth {
  readonly days: number;
  readonly name: string;
  readonly season: string;
  readonly gate: string;
  readonly dayH: number;
  readonly nightH: number;
  readonly info: string;
}

export interface TarenaDay {
  readonly day: number;
  readonly name: string;
  readonly energy: number;
  readonly description: string;
}

export interface MoonPhase {
  readonly max: number;
  readonly name: string;
}

export interface BiblicalEvent {
  readonly reference: string;
  readonly month: number;
  readonly day: number | null;
  readonly day_range: readonly [number, number] | null;
  readonly keyword: string;
  readonly context: string;
}

export interface ZoomConfig {
  readonly MIN: number;
  readonly MAX: number;
  readonly DEFAULT: number;
  readonly LABEL_THRESHOLD: number;
  readonly LABEL_EXPONENT: number;
}

// ── Julian date reference points ──────────────────────────────────────

export const J2000_EPOCH: number = 2451545.0;
export const JULIAN_UNIX_EPOCH: number = 2440587.5;

// ── Time unit conversions ─────────────────────────────────────────────

export const MINUTES_PER_DAY: number = 1440;
export const HOURS_PER_DAY: number = 24;
export const DAYS_PER_YEAR: number = 365.25;
export const MS_PER_DAY: number = 86400000;
export const MS_PER_HOUR: number = 3600000;
export const MS_PER_MINUTE: number = 60000;
export const SECONDS_PER_DAY: number = 86400;
export const JULIAN_CENTURY_DAYS: number = 36525.0;

// ── Date range limits (JS Date max/min) ───────────────────────────────

export const JS_DATE_MAX_MS: number = 8640000000000000;

// ── Zoom and pan ──────────────────────────────────────────────────────

export const ZOOM: ZoomConfig = { MIN: 0.5, MAX: 100, DEFAULT: 0.8, LABEL_THRESHOLD: 1.0, LABEL_EXPONENT: 0.6 } as const;

/** Counter-scale factor for labels/icons: 1.0 at low zoom, smooth shrink above threshold. */
export function zoomLabelScale(zoomK: number): number {
  if (zoomK <= ZOOM.LABEL_THRESHOLD) return 1;
  return 1 / Math.pow(zoomK / ZOOM.LABEL_THRESHOLD, ZOOM.LABEL_EXPONENT);
}
export const PAN_CLAMP_FACTOR: number = 0.7;

// ── Wheel zoom sensitivity ────────────────────────────────────────────

export const WHEEL_SENSITIVITY: number = 0.009;
export const WHEEL_ZOOM_FACTOR: number = 1.2;

// ── Hover hit-test ────────────────────────────────────────────────────

export const HOVER_MIN_RADIUS: number = 18;
export const HOVER_EXTRA_RADIUS: number = 8;

// ── Obliquity polynomial (arcseconds) ─────────────────────────────────

export const OBLIQUITY_COEFFS: readonly number[] = [84381.448, -4680.93, -1.55, 1999.25, -51.38, -249.67, -39.05, 7.12, 27.87, 5.79, 2.45] as const;

// ── Arcseconds to radians ─────────────────────────────────────────────

export const ARCSEC_TO_RAD: number = (1 / 3600) * (Math.PI / 180);

// ── Gregorian calendar reform JD ──────────────────────────────────────

export const GREGORIAN_CUTOVER_JD: number = 2299161;

// ── French month abbreviations (1-indexed, [0] is empty placeholder) ──

export const MONTH_NAMES_FR: readonly string[] = ['', 'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'] as const;

// ── Moon phase boundary angles (degrees) ──────────────────────────────

export const MOON_PHASE_BOUNDARIES: readonly MoonPhase[] = [
  { max: 4,   name: 'Nouvelle Lune' },
  { max: 84,  name: 'Croissant croissant' },
  { max: 96,  name: 'Premier Quartier' },
  { max: 176, name: 'Gibbeuse croissante' },
  { max: 184, name: 'Pleine Lune' },
  { max: 264, name: 'Gibbeuse décroissante' },
  { max: 276, name: 'Dernier Quartier' },
  { max: 356, name: 'Croissant décroissant' },
] as const;

// ── Tarena calendar (Polynesian lunar days) ───────────────────────────

export const TARENA: readonly TarenaDay[] = [
  { day: 1,  name: 'Tīreo', energy: 3, description: 'All kinds of fish have come to the surface. It is a favorable day for planting pineapple and cassava' },
  { day: 2,  name: 'Hirohiti', energy: 2, description: 'It is a propitious moon for fishing and for planting sweet potato and yam' },
  { day: 3,  name: 'Hoata', energy: 3, description: 'It is a fish-abundant moon regarding certain varieties' },
  { day: 4,  name: 'Hāmiami mua', energy: 3, description: 'These three moons are excellent for fishing' },
  { day: 5,  name: 'Hāmiami roto', energy: 3, description: 'These three moons are excellent for fishing' },
  { day: 6,  name: 'Hāmiami muri', energy: 3, description: 'These three moons are excellent for fishing' },
  { day: 7,  name: "'Ore'ore mua", energy: 1, description: 'There are no fish during these two moons' },
  { day: 8,  name: "'Ore'ore muri", energy: 1, description: 'There are no fish during these two moons' },
  { day: 9,  name: 'Tamatea', energy: 2, description: 'This moon is good for catching deep-sea fish' },
  { day: 10, name: 'Huna', energy: 1, description: 'During this moon, the fish are hiding' },
  { day: 11, name: 'Rapu', energy: 2, description: 'Fish continue to hide during this moon' },
  { day: 12, name: 'Maharu', energy: 1, description: 'There are still no fish. It is a moon with squalls' },
  { day: 13, name: "'Ohua", energy: 3, description: 'The moon is fish-abundant. It is still a moon with squalls' },
  { day: 14, name: 'Maitū', energy: 3, description: 'Fish are abundant. It is good to plant the day after this moon' },
  { day: 15, name: 'Hotu', energy: 3, description: 'It is a fish-abundant moon' },
  { day: 16, name: "Māra'i", energy: 3, description: 'It is a fish-abundant moon' },
  { day: 17, name: 'Turu', energy: 3, description: 'The moon is favorable for crab fishing. This moon is also good for planting banana trees, plantains, and coconut trees' },
  { day: 18, name: "Rā'au mua", energy: 1, description: 'Plants germinate on these days. The night is bad for fishing' },
  { day: 19, name: "Rā'au roto", energy: 1, description: 'Plants germinate on these days. The night is bad for fishing' },
  { day: 20, name: "Rā'au muri", energy: 1, description: 'Plants germinate on these days. The night is bad for fishing' },
  { day: 21, name: "'Ore'ore mua", energy: 1, description: 'There are still no fish' },
  { day: 22, name: "'Ore'ore roto", energy: 1, description: 'The fish are returning' },
  { day: 23, name: "'Ore'ore muri", energy: 2, description: 'The fish are returning' },
  { day: 24, name: "Ta'aroa mua", energy: 3, description: 'It is a fish-abundant moon' },
  { day: 25, name: "Ta'aroa roto", energy: 3, description: 'It is a fish-abundant moon' },
  { day: 26, name: "Ta'aroa muri", energy: 3, description: 'There is fish' },
  { day: 27, name: 'Tāne', energy: 3, description: 'Fish-abundant. Favorable for planting all tubers' },
  { day: 28, name: "Ro'onui", energy: 1, description: 'Fish are starting to become rare' },
  { day: 29, name: "Ro'o Mauri", energy: 1, description: 'No fish' },
  { day: 30, name: 'Mutu', energy: 1, description: 'No fish' },
] as const;

// ── Celestial bodies definition ───────────────────────────────────────

export const CELESTIAL_BODIES: readonly CelestialBody[] = [
  { id: 'Sun',     name: 'Soleil',  color: '#f5e5b8', radius: 8,   glow: 22, labelOffset: [12, 0] },
  { id: 'Moon',    name: 'Lune',    color: '#dce8f5', radius: 6,   glow: 12, labelOffset: [10, 0] },
  { id: 'Mercury', name: 'Mercure', color: '#a8b8c5', radius: 3,   glow: 5,  labelOffset: [7, 0] },
  { id: 'Venus',   name: 'Vénus',   color: '#e8d5aa', radius: 4.5, glow: 10, labelOffset: [9, 0] },
  { id: 'Mars',    name: 'Mars',    color: '#c9705a', radius: 4,   glow: 8,  labelOffset: [8, 0] },
  { id: 'Jupiter', name: 'Jupiter', color: '#bdb0a5', radius: 6,   glow: 10, labelOffset: [11, 0] },
  { id: 'Saturn',  name: 'Saturne', color: '#d5cfa0', radius: 5.5, glow: 8,  labelOffset: [10, 0] },
] as const;

// ── Zodiac signs with ecliptic longitudes (center of each sign) ───────

export const ZODIAC_SIGNS: readonly ZodiacSign[] = [
  { symbol: '♈', name: 'Bélier',      eclLon: 15 },
  { symbol: '♉', name: 'Taureau',     eclLon: 45 },
  { symbol: '♊', name: 'Gémeaux',     eclLon: 75 },
  { symbol: '♋', name: 'Cancer',      eclLon: 105 },
  { symbol: '♌', name: 'Lion',        eclLon: 135 },
  { symbol: '♍', name: 'Vierge',      eclLon: 165 },
  { symbol: '♎', name: 'Balance',     eclLon: 195 },
  { symbol: '♏', name: 'Scorpion',    eclLon: 225 },
  { symbol: '♐', name: 'Sagittaire',  eclLon: 255 },
  { symbol: '♑', name: 'Capricorne',  eclLon: 285 },
  { symbol: '♒', name: 'Verseau',     eclLon: 315 },
  { symbol: '♓', name: 'Poissons',    eclLon: 345 },
] as const;

// ── Season definitions ────────────────────────────────────────────────

export const SEASON_DEFS: readonly SeasonDef[] = [
  { key: 'vernal',   eclLon: 0,   symbol: 'γ', label: 'Équinoxe vernal',  sub: 'Point γ',  color: 'rgba(180,235,195,0.85)', glowColor: 'rgba(150,220,170,0.4)',  markerR: 5 },
  { key: 'summer',   eclLon: 90,  symbol: '☀', label: "Solstice d'été",   sub: 'Max Nord',  color: 'rgba(255,218,140,0.85)', glowColor: 'rgba(255,200,80,0.35)',  markerR: 5 },
  { key: 'autumnal', eclLon: 180, symbol: 'Ω', label: 'Équinoxe automnal', sub: 'Point Ω',  color: 'rgba(200,175,235,0.85)', glowColor: 'rgba(170,140,220,0.35)', markerR: 5 },
  { key: 'winter',   eclLon: 270, symbol: '❄', label: "Solstice d'hiver", sub: 'Max Sud',   color: 'rgba(160,205,240,0.85)', glowColor: 'rgba(120,175,230,0.35)', markerR: 5 },
] as const;

// ── Event labels by hemisphere ────────────────────────────────────────

export const EVENT_LABELS_N: EventLabelsMap = {
  vernal:   { label: 'Équinoxe vernal',   symbol: 'γ', color: 'rgba(180,235,195,0.85)' },
  summer:   { label: "Solstice d'été",     symbol: '☀', color: 'rgba(255,218,140,0.85)' },
  autumnal: { label: 'Équinoxe automnal',  symbol: 'Ω', color: 'rgba(200,175,235,0.85)' },
  winter:   { label: "Solstice d'hiver",   symbol: '❄', color: 'rgba(160,205,240,0.85)' },
} as const;

export const EVENT_LABELS_S: EventLabelsMap = {
  vernal:   { label: 'Équinoxe automnal',  symbol: 'Ω', color: 'rgba(200,175,235,0.85)' },
  summer:   { label: "Solstice d'hiver",   symbol: '❄', color: 'rgba(160,205,240,0.85)' },
  autumnal: { label: 'Équinoxe vernal',    symbol: 'γ', color: 'rgba(180,235,195,0.85)' },
  winter:   { label: "Solstice d'été",     symbol: '☀', color: 'rgba(255,218,140,0.85)' },
} as const;

// ── Enoch calendar ────────────────────────────────────────────────────

export const ENOCH_YEAR_DAYS: number = 364;

export const ENOCH_MONTHS: readonly EnochMonth[] = [
  { days: 31, name: 'Mois 1',  season: 'Printemps', gate: '4e Porte',  dayH: 9,  nightH: 9,  info: 'Équinoxe de printemps' },
  { days: 30, name: 'Mois 2',  season: 'Printemps', gate: '5e Porte',  dayH: 10, nightH: 8,  info: '' },
  { days: 30, name: 'Mois 3',  season: 'Printemps', gate: '6e Porte',  dayH: 12, nightH: 6,  info: "Approche de l\u2019été" },
  { days: 31, name: 'Mois 4',  season: 'Été',       gate: '6e Porte',  dayH: 12, nightH: 6,  info: "Solstice d\u2019été" },
  { days: 30, name: 'Mois 5',  season: 'Été',       gate: '5e Porte',  dayH: 11, nightH: 7,  info: '' },
  { days: 30, name: 'Mois 6',  season: 'Été',       gate: '4e Porte',  dayH: 9,  nightH: 9,  info: "Transition vers l\u2019automne" },
  { days: 31, name: 'Mois 7',  season: 'Automne',   gate: '4e Porte',  dayH: 9,  nightH: 9,  info: "Équinoxe d\u2019automne" },
  { days: 30, name: 'Mois 8',  season: 'Automne',   gate: '3e Porte',  dayH: 8,  nightH: 10, info: '' },
  { days: 30, name: 'Mois 9',  season: 'Automne',   gate: '2e Porte',  dayH: 7,  nightH: 11, info: "Approche de l\u2019hiver" },
  { days: 31, name: 'Mois 10', season: 'Hiver',     gate: '1re Porte', dayH: 6,  nightH: 12, info: "Solstice d\u2019hiver" },
  { days: 30, name: 'Mois 11', season: 'Hiver',     gate: '2e Porte',  dayH: 7,  nightH: 11, info: '' },
  { days: 30, name: 'Mois 12', season: 'Hiver',     gate: '3e Porte',  dayH: 8,  nightH: 10, info: 'Retour vers le printemps' },
] as const;

// ── Toggle IDs for checkbox caching ───────────────────────────────────

export const TOGGLE_IDS: readonly string[] = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'zodiac', 'seasons', 'equator', 'navstars', 'cities', 'enoch', 'winds', 'windParticles', 'solarTime', 'tideLayers', 'rua', 'pou'] as const;

// ── Wind particle configuration ────────────────────────────────────────

export const WIND_PARTICLE_COUNT = typeof window !== 'undefined' && window.innerWidth < 768 ? 4000 : 8000;
export const WIND_SPEED_FACTOR = 0.18;
export const WIND_MAX_AGE_MIN = 30;
export const WIND_MAX_AGE_MAX = 80;
export const WIND_FADE_ALPHA = 0.14;
export const WIND_DATA_URL = '/wind/gfs-current.bin';

// ── Enoch year days constant ──────────────────────────────────────────

export const ENOCH_OUT_OF_TIME_START: number = 364;

// ── Long French month names (0-indexed) ───────────────────────────────

export const MONTH_NAMES_LONG_FR: readonly string[] = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
] as const;

// ── Time step units ───────────────────────────────────────────────────

export const STEP_UNITS = ['sec', 'min', 'hour', 'day', 'month', 'year'] as const;
export type StepUnit = typeof STEP_UNITS[number];

export const STEP_LABELS: Record<StepUnit, string> = {
  sec: '1s', min: '1min', hour: '1h', day: '1j', month: '1M', year: '1an',
} as const;

// ── Tropical year days (approximate) ──────────────────────────────────

export const AVG_MONTH_DAYS: number = 30.436875;

// ── Layout & UI constants ──────────────────────────────────────────────

export const MOBILE_VIEWPORT_THRESHOLD = 550;
export const BIBLICAL_EVENTS_THROTTLE_MS = 1000;
export const UI_TRANSITION_MS = 800;
export const DT_FALLBACK = 0.016;

// ── Alert cooldown (Julian days) ──────────────────────────────────────

export const ALERT_COOLDOWN_JD: number = 0.3;

// ── Hemisphere opacity values ─────────────────────────────────────────

export const HEM_OPACITY_ACTIVE: string = '0.95';
export const HEM_OPACITY_INACTIVE: string = '0.45';

// ── Biblical events ───────────────────────────────────────────────────

export const BIBLICAL_EVENTS: readonly BiblicalEvent[] = [
  { reference: "Genesis 7:11", month: 2, day: 17, day_range: null, keyword: "Déluge", context: "Début du déluge — toutes les sources du grand abîme jaillissent" },
  { reference: "Genesis 8:4", month: 7, day: 17, day_range: null, keyword: "Repos", context: "L'arche s'arrête sur les montagnes d'Ararat" },
  { reference: "Genesis 8:5", month: 10, day: 1, day_range: null, keyword: "Déluge", context: "Les eaux diminuent, les sommets des montagnes deviennent visibles" },
  { reference: "Genesis 8:13", month: 1, day: 1, day_range: null, keyword: "Assèchement", context: "Les eaux s'assèchent sur la terre (601e année de Noé)" },
  { reference: "Genesis 8:14", month: 2, day: 27, day_range: null, keyword: "Restauration", context: "La terre est complètement sèche" },
  { reference: "Exodus 12:2-3", month: 1, day: 10, day_range: null, keyword: "Préparation", context: "Choix de l'agneau pascal — ce mois sera le premier de l'année" },
  { reference: "Exodus 12:6", month: 1, day: 14, day_range: null, keyword: "Délivrance", context: "Immolation de l'agneau pascal au soir" },
  { reference: "Exodus 12:15", month: 1, day: 15, day_range: null, keyword: "Départ", context: "Départ effectif d'Égypte — premier jour des pains sans levain" },
  { reference: "Exodus 12:18", month: 1, day: 14, day_range: [14, 21], keyword: "Délivrance", context: "Fête des pains sans levain (du 14e au 21e jour)" },
  { reference: "Exodus 16:1", month: 2, day: 15, day_range: null, keyword: "Murmure", context: "Murmures avant la manne dans le désert de Sin" },
  { reference: "Exodus 19:1", month: 3, day: 15, day_range: null, keyword: "Arrivée", context: "Arrivée au désert de Sinaï — même jour que le départ d'Égypte" },
  { reference: "Exodus 23:16", month: 3, day: null, day_range: null, keyword: "Moisson", context: "Fête de la moisson (Shavouot), célébrée avec les prémices des récoltes" },
  { reference: "Leviticus 23:15-21", month: 3, day: 6, day_range: null, keyword: "Semaines", context: "Fête des Semaines (Shavouot), décompte de 50 jours après l'offrande de l'omer, avec offrandes de pain et sacrifices" },
  { reference: "Numbers 28:26-31", month: 3, day: 6, day_range: null, keyword: "Prémices", context: "Jour des prémices (Shavouot), sainte convocation avec offrandes spéciales pour la fête des Semaines" },
  { reference: "Deuteronomy 16:9-12", month: 3, day: 6, day_range: null, keyword: "Semaines", context: "Fête des Semaines (Shavouot), décompte de sept semaines depuis le début de la moisson, célébrée avec offrandes et joie communautaire" },
  { reference: "Exodus 40:2", month: 1, day: 1, day_range: null, keyword: "Tabernacle", context: "Ordre d'élever le tabernacle le premier jour du premier mois" },
  { reference: "Exodus 40:17", month: 1, day: 1, day_range: null, keyword: "Tabernacle", context: "Érection effective du tabernacle (deuxième année)" },
  { reference: "Leviticus 23:5", month: 1, day: 14, day_range: null, keyword: "Pâque", context: "La Pâque de l'Éternel commence au crépuscule le quatorzième jour" },
  { reference: "Leviticus 23:6", month: 1, day: 15, day_range: [15, 21], keyword: "Azymes", context: "Début de la fête des pains sans levain — sept jours" },
  { reference: "Leviticus 23:24", month: 7, day: 1, day_range: null, keyword: "Trompettes", context: "Jour du son de la trompette — mémorial et sainte convocation" },
  { reference: "Leviticus 23:27", month: 7, day: 10, day_range: null, keyword: "Expiation", context: "Jour de l'expiation — sainte convocation et affliction des âmes" },
  { reference: "Leviticus 23:34", month: 7, day: 15, day_range: [15, 21], keyword: "Cabanes", context: "Fête des cabanes (Tabernacles) — sept jours" },
  { reference: "Leviticus 23:39", month: 7, day: 15, day_range: [15, 22], keyword: "Cabanes", context: "Fête des cabanes avec huitième jour d'assemblée solennelle" },
  { reference: "I Enoch 60:1", month: 7, day: 14, day_range: null, keyword: "Vision de Noé", context: "Léviathan et Béhémoth" },
  { reference: "Numbers 1:1", month: 2, day: 1, day_range: null, keyword: "Dénombrement", context: "Premier recensement dans le désert de Sinaï (deuxième année, deuxième mois)" },
  { reference: "Numbers 9:1", month: 1, day: 1, day_range: null, keyword: "Pâque", context: "Instruction de la Pâque dans le désert (deuxième année, premier mois)" },
  { reference: "Numbers 9:11", month: 2, day: 14, day_range: null, keyword: "Pâque", context: "Seconde Pâque pour ceux qui étaient impurs" },
  { reference: "Numbers 10:11", month: 2, day: 20, day_range: null, keyword: "Départ", context: "Départ du Sinaï — la nuée s'élève (deuxième année)" },
  { reference: "Numbers 20:1", month: 1, day: 1, day_range: null, keyword: "Mort", context: "Mort de Miriam à Kadès" },
  { reference: "Numbers 33:3", month: 1, day: 15, day_range: null, keyword: "Départ", context: "Départ de Ramsès — lendemain de la Pâque" },
  { reference: "Numbers 33:38", month: 5, day: 1, day_range: null, keyword: "Mort", context: "Mort d'Aaron sur le mont Hor (40e année)" },
  { reference: "Deuteronomy 1:3", month: 11, day: 1, day_range: null, keyword: "Discours", context: "Moïse parle au peuple" },
  { reference: "Joshua 4:19", month: 1, day: 10, day_range: null, keyword: "Traversée", context: "Entrée en Canaan par le Jourdain" },
  { reference: "1 Kings 6:1", month: 2, day: 1, day_range: null, keyword: "Construction", context: "Début du temple de Salomon (4e année, 2e mois)" },
  { reference: "1 Kings 6:38", month: 8, day: 1, day_range: null, keyword: "Achèvement", context: "Achèvement du temple de Salomon (7 ans)" },
  { reference: "1 Kings 8:2", month: 7, day: 15, day_range: null, keyword: "Dédicace", context: "Dédicace du temple à la fête des cabanes" },
  { reference: "1 Kings 12:32", month: 8, day: 15, day_range: null, keyword: "Apostasie", context: "Fausse fête de Jéroboam" },
  { reference: "2 Chronicles 7:10", month: 7, day: 23, day_range: null, keyword: "Congé", context: "Fin de la célébration de la dédicace" },
  { reference: "2 Chronicles 29:17", month: 1, day: 1, day_range: [1, 16], keyword: "Purification", context: "Purification du temple sous Ézéchias" },
  { reference: "2 Chronicles 30:2", month: 2, day: 14, day_range: null, keyword: "Pâque", context: "Pâque retardée d'Ézéchias" },
  { reference: "2 Chronicles 35:1", month: 1, day: 14, day_range: null, keyword: "Pâque", context: "Grande Pâque de Josias" },
  { reference: "Ezra 3:1", month: 7, day: 1, day_range: null, keyword: "Autel", context: "Reconstruction de l'autel après le retour" },
  { reference: "Ezra 3:6", month: 7, day: 1, day_range: null, keyword: "Offrande", context: "Premières offrandes après le retour" },
  { reference: "Ezra 6:15", month: 12, day: 3, day_range: null, keyword: "Temple", context: "Achèvement du second temple" },
  { reference: "Ezra 7:9", month: 1, day: 1, day_range: null, keyword: "Voyage", context: "Début du voyage d'Esdras" },
  { reference: "Ezra 7:9", month: 5, day: 1, day_range: null, keyword: "Arrivée", context: "Arrivée d'Esdras à Jérusalem" },
  { reference: "Ezra 10:16-17", month: 10, day: 1, day_range: null, keyword: "Enquête", context: "Enquête sur les mariages mixtes" },
  { reference: "Nehemiah 1:1", month: 9, day: 1, day_range: null, keyword: "Nouvelles", context: "Néhémie apprend l'état de Jérusalem" },
  { reference: "Nehemiah 2:1", month: 1, day: 1, day_range: null, keyword: "Permission", context: "Néhémie obtient la permission de rebâtir" },
  { reference: "Nehemiah 6:15", month: 6, day: 25, day_range: null, keyword: "Muraille", context: "Achèvement de la muraille de Jérusalem" },
  { reference: "Nehemiah 8:2", month: 7, day: 1, day_range: null, keyword: "Lecture", context: "Lecture de la Loi par Esdras" },
  { reference: "Nehemiah 8:14", month: 7, day: 15, day_range: [15, 21], keyword: "Cabanes", context: "Célébration de la fête des cabanes" },
  { reference: "Esther 2:16", month: 10, day: 1, day_range: null, keyword: "Rencontre", context: "Esther rencontre le roi (mois de Tébeth)" },
  { reference: "Esther 3:12", month: 1, day: 13, day_range: null, keyword: "Sort", context: "Tirage au sort durant le premier mois & Convocation des secrétaires du roi et rédaction du décret d'extermination le 13." },
  { reference: "Esther 3:13", month: 12, day: 13, day_range: null, keyword: "Complot", context: "Décret d'Haman pour détruire les Juifs" },
  { reference: "Esther 8:12", month: 12, day: 13, day_range: null, keyword: "Défense", context: "Contre-décret pour les Juifs" },
  { reference: "Esther 9:1", month: 12, day: 13, day_range: null, keyword: "Victoire", context: "Jour du combat et de la victoire des Juifs" },
  { reference: "Esther 9:17", month: 12, day: 14, day_range: null, keyword: "Repos", context: "Jour de repos et de festin" },
  { reference: "Esther 9:18", month: 12, day: 15, day_range: null, keyword: "Pourim", context: "Jour de célébration de Pourim" },
  { reference: "Jeremiah 1:3", month: 5, day: 10, day_range: null, keyword: "Exil", context: "Fin du règne de Jojakim et exil" },
  { reference: "Jeremiah 36:9", month: 9, day: 5, day_range: null, keyword: "Jeûne", context: "Jeûne proclamé, lecture du rouleau" },
  { reference: "Jeremiah 39:2", month: 4, day: 9, day_range: null, keyword: "Brèche", context: "Brèche ouverte dans la muraille de Jérusalem" },
  { reference: "Jeremiah 52:4", month: 10, day: 10, day_range: null, keyword: "Siège", context: "Début du siège de Jérusalem par Nebucadnetsar" },
  { reference: "Jeremiah 52:6", month: 4, day: 9, day_range: null, keyword: "Famine", context: "Famine sévère pendant le siège" },
  { reference: "Jeremiah 52:12", month: 5, day: 10, day_range: null, keyword: "Destruction", context: "Destruction du temple par Nebuzaradan" },
  { reference: "Jeremiah 52:31", month: 12, day: 25, day_range: null, keyword: "Libération", context: "Libération de Jojakin de prison" },
  { reference: "Ezekiel 1:1-2", month: 4, day: 5, day_range: null, keyword: "Révélation", context: "Vision des cieux ouverts (5e année d'exil)" },
  { reference: "Ezekiel 8:1", month: 6, day: 5, day_range: null, keyword: "Transport", context: "Vision — transport à Jérusalem" },
  { reference: "Ezekiel 20:1", month: 5, day: 10, day_range: null, keyword: "Parole", context: "Parole aux anciens d'Israël" },
  { reference: "Ezekiel 24:1", month: 10, day: 10, day_range: null, keyword: "Parabole", context: "Parabole de la marmite bouillante — début du siège" },
  { reference: "Ezekiel 29:1", month: 10, day: 12, day_range: null, keyword: "Jugement", context: "Jugement contre l'Égypte" },
  { reference: "Ezekiel 29:17", month: 1, day: 1, day_range: null, keyword: "Consolation", context: "Prophétie sur Nebucadnetsar et l'Égypte" },
  { reference: "Ezekiel 30:20", month: 1, day: 7, day_range: null, keyword: "Bras", context: "Jugement sur le bras du Pharaon" },
  { reference: "Ezekiel 31:1", month: 3, day: 1, day_range: null, keyword: "Allégorie", context: "Allégorie de l'Assyrie comme cèdre" },
  { reference: "Ezekiel 32:1", month: 12, day: 1, day_range: null, keyword: "Lamentation", context: "Lamentation sur le Pharaon" },
  { reference: "Ezekiel 33:21", month: 10, day: 5, day_range: null, keyword: "Nouvelles", context: "La chute de Jérusalem parvient aux exilés" },
  { reference: "Ezekiel 40:1", month: 1, day: 10, day_range: null, keyword: "Temple", context: "Vision du temple idéal" },
  { reference: "Daniel 10:4, 10:2-3", month: 1, day: 24, day_range: null, keyword: "Vision", context: "Vision surnaturelle" },
  { reference: "Haggai 1:1", month: 6, day: 1, day_range: null, keyword: "Exhortation", context: "Parole pour rebâtir le temple" },
  { reference: "Haggai 1:15", month: 6, day: 24, day_range: null, keyword: "Travail", context: "Début des travaux de reconstruction du temple" },
  { reference: "Haggai 2:1", month: 7, day: 21, day_range: null, keyword: "Encouragement", context: "Encouragement divin pendant la fête des cabanes" },
  { reference: "Haggai 2:10", month: 9, day: 24, day_range: null, keyword: "Bénédiction", context: "Promesse de bénédiction" },
  { reference: "Haggai 2:20", month: 9, day: 24, day_range: null, keyword: "Zorobabel", context: "Promesse à Zorobabel" },
  { reference: "Zechariah 1:1", month: 8, day: 1, day_range: null, keyword: "Appel", context: "Appel à revenir à l'Éternel" },
  { reference: "Zechariah 1:7", month: 11, day: 24, day_range: null, keyword: "Songes", context: "Visions nocturnes de chevaux" },
  { reference: "Zechariah 7:1", month: 9, day: 4, day_range: null, keyword: "Question", context: "Question sur le jeûne et le deuil" },
  { reference: "2 Kings 25:1", month: 10, day: 10, day_range: null, keyword: "Siège", context: "Début du dernier siège de Jérusalem" },
  { reference: "2 Kings 25:3", month: 4, day: 9, day_range: null, keyword: "Famine", context: "Famine sévère dans la ville" },
  { reference: "2 Kings 25:8", month: 5, day: 7, day_range: null, keyword: "Destruction", context: "Nebuzaradan vient à Jérusalem" },
  { reference: "2 Kings 25:25", month: 7, day: 1, day_range: null, keyword: "Meurtre", context: "Assassinat de Guedalia" },
  { reference: "Zechariah 8:19", month: 4, day: 17, day_range: null, keyword: "Jeûne", context: "Jeûne du quatrième mois" },
  { reference: "Zechariah 8:19", month: 5, day: 9, day_range: null, keyword: "Jeûne", context: "Jeûne du cinquième mois" },
  { reference: "Zechariah 8:19", month: 7, day: 3, day_range: null, keyword: "Jeûne", context: "Jeûne du septième mois" },
  { reference: "Zechariah 8:19", month: 10, day: 10, day_range: null, keyword: "Jeûne", context: "Jeûne du dixième mois" },
  { reference: "Matarii i ni a", month: 2, day: 29, day_range: null, keyword: "Polynésie", context: "Dates polynésiennes" },
  { reference: "Matarii i raro", month: 8, day: 28, day_range: null, keyword: "Polynésie", context: "Dates polynésiennes" },
  { reference: "Matariki", month: 9, day: 28, day_range: null, keyword: "Polynésie", context: "Dates polynésiennes" },
  { reference: "Matariki", month: 9, day: 29, day_range: null, keyword: "Polynésie", context: "Dates polynésiennes" },
  { reference: "Matariki", month: 9, day: 30, day_range: null, keyword: "Polynésie", context: "Dates polynésiennes" },
  { reference: "Matariki", month: 10, day: 1, day_range: null, keyword: "Polynésie", context: "Dates polynésiennes" },
] as const;
