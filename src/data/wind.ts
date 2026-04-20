// ── Tahitian winds — Traditional Polynesian wind rose ─────
// 16 sectors of 22.5° each, named according to Tahitian oral tradition.

export interface TahitianWind {
  /** Starting azimuth of sector in degrees (0 = North, clockwise) */
  azimuth: number;
  /** Traditional Tahitian name */
  name: string;
  /** Cardinal abbreviation in English */
  abbr: string;
  /** French translation */
  label: string;
}

export const TAHITIAN_WINDS: readonly TahitianWind[] = [
  { azimuth:   0,   name: "Pāfa'ite",   abbr: "N",   label: "Nord" },
  { azimuth:  22.5, name: "Fa'arua",    abbr: "NNE", label: "Nord-Nord-Est" },
  { azimuth:  45,   name: "Huatau",     abbr: "NE",  label: "Nord-Est" },
  { azimuth:  67.5, name: "Ha'apiti",   abbr: "ENE", label: "Est-Nord-Est" },
  { azimuth:  90,   name: "Maoa'e",     abbr: "E",   label: "Est" },
  { azimuth: 112.5, name: "Tuauru",     abbr: "ESE", label: "Est-Sud-Est" },
  { azimuth: 135,   name: "Mara'i",     abbr: "SE",  label: "Sud-Est" },
  { azimuth: 157.5, name: "Arafenua",   abbr: "SSE", label: "Sud-Sud-Est" },
  { azimuth: 180,   name: "To'amuri",   abbr: "S",   label: "Sud" },
  { azimuth: 202.5, name: "Tuihana",    abbr: "SSW", label: "Sud-Sud-Ouest" },
  { azimuth: 225,   name: "Ra'i",       abbr: "SW",  label: "Sud-Ouest" },
  { azimuth: 247.5, name: "Matapārapu", abbr: "WSW", label: "Ouest-Sud-Ouest" },
  { azimuth: 270,   name: "To'erau",    abbr: "W",   label: "Ouest" },
  { azimuth: 292.5, name: "Rapati'a",   abbr: "WNW", label: "Ouest-Nord-Ouest" },
  { azimuth: 315,   name: "'Ārueroa",   abbr: "NW",  label: "Nord-Ouest" },
  { azimuth: 337.5, name: "Mohio",      abbr: "NNW", label: "Nord-Nord-Ouest" },
] as const;

