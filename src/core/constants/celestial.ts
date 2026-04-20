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

export const CELESTIAL_BODIES: readonly CelestialBody[] = [
  { id: 'Sun',     name: 'Soleil',  color: '#f5e5b8', radius: 8,   glow: 22, labelOffset: [12, 0] },
  { id: 'Moon',    name: 'Lune',    color: '#dce8f5', radius: 6,   glow: 12, labelOffset: [10, 0] },
  { id: 'Mercury', name: 'Mercure', color: '#a8b8c5', radius: 3,   glow: 5,  labelOffset: [7, 0] },
  { id: 'Venus',   name: 'Vénus',   color: '#e8d5aa', radius: 4.5, glow: 10, labelOffset: [9, 0] },
  { id: 'Mars',    name: 'Mars',    color: '#c9705a', radius: 4,   glow: 8,  labelOffset: [8, 0] },
  { id: 'Jupiter', name: 'Jupiter', color: '#bdb0a5', radius: 6,   glow: 10, labelOffset: [11, 0] },
  { id: 'Saturn',  name: 'Saturne', color: '#d5cfa0', radius: 5.5, glow: 8,  labelOffset: [10, 0] },
] as const;

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

export const SEASON_DEFS: readonly SeasonDef[] = [
  { key: 'vernal',   eclLon: 0,   symbol: 'γ', label: 'Équinoxe vernal',  sub: 'Point γ',  color: 'rgba(180,235,195,0.85)', glowColor: 'rgba(150,220,170,0.4)',  markerR: 5 },
  { key: 'summer',   eclLon: 90,  symbol: '☀', label: "Solstice d'été",   sub: 'Max Nord',  color: 'rgba(255,218,140,0.85)', glowColor: 'rgba(255,200,80,0.35)',  markerR: 5 },
  { key: 'autumnal', eclLon: 180, symbol: 'Ω', label: 'Équinoxe automnal', sub: 'Point Ω',  color: 'rgba(200,175,235,0.85)', glowColor: 'rgba(170,140,220,0.35)', markerR: 5 },
  { key: 'winter',   eclLon: 270, symbol: '❄', label: "Solstice d'hiver", sub: 'Max Sud',   color: 'rgba(160,205,240,0.85)', glowColor: 'rgba(120,175,230,0.35)', markerR: 5 },
] as const;

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