/**
 * rua-pou.ts
 * Rua (star paths) and Pou (celestial pillars) — Tahitian celestial navigation.
 *
 * Rua are corridors of stars at approximately the same declination,
 * running East to West. Each rua has a marker star (ta'urua).
 *
 * Pou are meridian lines (N-S) through an 'ana star.
 *
 * Coordinates: RA in hours (J2000), Dec in degrees (J2000).
 * Proper motion in mas/yr from Hipparcos where available.
 *
 * Source: Teriierooiterai, Thèse UPF 2013, ch. IV–V.
 */

export interface Rua {
  readonly num: number;
  readonly name: string;
  readonly constellation: string;
  readonly marker: string;
  /** Approximate declination of the corridor (degrees, J2000) */
  readonly dec: number;
  readonly color: string;
  /** J2000 RA of the marker star (hours). Absent for ecliptic/solar rua. */
  readonly markerRa?: number;
  /** J2000 Dec of the marker star (degrees) */
  readonly markerDec?: number;
  /** Proper motion RA (mas/yr) */
  readonly markerPmRa?: number;
  /** Proper motion Dec (mas/yr) */
  readonly markerPmDec?: number;
}

export interface Pou {
  readonly num: number;
  readonly name: string;
  readonly anaStar: string;
  readonly westernStar: string;
  /** J2000 RA (hours) */
  readonly ra: number;
  /** J2000 Dec (degrees) */
  readonly dec: number;
  /** Proper motion RA (mas/yr) */
  readonly pm_ra: number;
  /** Proper motion Dec (mas/yr) */
  readonly pm_dec: number;
  readonly color: string;
}

export interface Aveia {
  readonly island: string;
  readonly star: string;
  readonly western: string;
  /** J2000 Declination (degrees) */
  readonly dec: number;
}

// ── Color palettes ────────────────────────────────────────────────────

const RUA_COLORS: readonly string[] = [
  'rgba(100,180,130,0.40)',   // 1:  sage green       — Cygnus
  'rgba(220,175,80,0.40)',    // 2:  golden           — Orion-N
  'rgba(190,150,90,0.40)',   // 3:  tan              — Orion-S
  'rgba(200,130,130,0.40)',  // 4:  rose              — Hydra
  'rgba(230,205,100,0.45)',  // 5:  bright gold       — Canis Major
  'rgba(100,170,210,0.40)',  // 6:  sky blue          — Piscis Australis
  'rgba(140,190,130,0.40)',  // 7:  sage-green        — Capricorn
  'rgba(180,140,190,0.40)',  // 8:  lavender          — Grus
  'rgba(200,155,115,0.40)', // 9:  copper            — Argo
  'rgba(200,215,235,0.25)',  // 10: muted ecliptic    — Ecliptic
  'rgba(255,210,140,0.35)',  // 11: warm solstice     — Summer
  'rgba(150,200,240,0.35)',  // 12: cool solstice     — Winter
] as const;

const POU_COLORS: readonly string[] = [
  'rgba(140,210,150,0.50)',  // 1:  fresh green    — Antares
  'rgba(220,185,120,0.50)',  // 2:  amber          — Zuben-Eschamali
  'rgba(160,195,230,0.50)',  // 3:  periwinkle     — Regulus
  'rgba(200,185,145,0.50)',  // 4:  wheat          — Dubhe
  'rgba(225,155,155,0.50)',  // 5:  salmon         — Alphard
  'rgba(185,165,220,0.50)',  // 6:  lilac          — Arcturus
  'rgba(175,210,155,0.50)',  // 7:  chartreuse     — Procyon
  'rgba(225,180,130,0.50)',  // 8:  peach          — Betelgeuse
  'rgba(160,205,195,0.50)',  // 9:  teal           — Phaet
  'rgba(215,205,175,0.50)',  // 10: cream          — Polaris
] as const;

// ── Rua (12 star paths) ──────────────────────────────────────────────

export const RUA: readonly Rua[] = [
  { num: 1,  name: "Rua-i-te-ha'apara'a-manu", constellation: 'Cygnus',               marker: 'Deneb',          dec: 45.28,   color: RUA_COLORS[0],  markerRa: 20.6905, markerDec: 45.2803, markerPmRa: 2.01,    markerPmDec: 1.85 },
  { num: 2,  name: 'Rua-nui-o-mere',           constellation: 'Orion-N',              marker: 'Betelgeuse',     dec: 7.41,    color: RUA_COLORS[1],  markerRa: 5.9194,  markerDec: 7.4069,  markerPmRa: 27.54,   markerPmDec: 11.30 },
  { num: 3,  name: "Rua-o-mere-ma-tutahi",     constellation: 'Orion-S',              marker: 'Alnilam',        dec: -1.20,   color: RUA_COLORS[2],  markerRa: 5.6036,  markerDec: -1.2019, markerPmRa: 1.49,    markerPmDec: -1.06 },
  { num: 4,  name: 'Rua-o-feufeu',             constellation: 'Hydra-N',              marker: 'Alphard',        dec: -8.66,   color: RUA_COLORS[3],  markerRa: 9.4598,  markerDec: -8.6586, markerPmRa: -14.44,  markerPmDec: 33.19 },
  { num: 5,  name: 'Rua-faupapa',              constellation: 'Canis Major',          marker: 'Sirius',         dec: -16.72,  color: RUA_COLORS[4],  markerRa: 6.7525,  markerDec: -16.7161,markerPmRa: -546.01, markerPmDec: -1223.07 },
  { num: 6,  name: 'Rua-nui-o-atutahi',         constellation: 'Piscis Australis',    marker: 'Fomalhaut',      dec: -29.62,  color: RUA_COLORS[5],  markerRa: 22.9608, markerDec: -29.6222,markerPmRa: 328.95,  markerPmDec: -164.67 },
  { num: 7,  name: 'Rua-o-mere',                constellation: 'Capricorn',           marker: 'Deneb Algedi',   dec: -23.27,  color: RUA_COLORS[6],  markerRa: 21.7842, markerDec: -16.1332,markerPmRa: 17.55,   markerPmDec: 3.07 },
  { num: 8,  name: 'Rua-manu',                 constellation: 'Grus',                marker: 'Alnair',         dec: -46.96,  color: RUA_COLORS[7],  markerRa: 22.1372, markerDec: -46.9610,markerPmRa: 17.11,   markerPmDec: -48.50 },
  { num: 9,  name: 'Rua-tupu-tai-nanu',        constellation: 'Argo',                 marker: 'Canopus',        dec: -52.70,  color: RUA_COLORS[8],  markerRa: 6.3992,  markerDec: -52.6957,markerPmRa: 19.99,   markerPmDec: 23.67 },
  { num: 10, name: "Tua-o-uru-po'i",           constellation: 'Ecliptic',             marker: 'Venus/Jupiter',  dec: 0,       color: RUA_COLORS[9] },
  { num: 11, name: 'Rua-roa',                  constellation: "Solstice d'ete",       marker: 'Sun',            dec: -23.44,  color: RUA_COLORS[10] },
  { num: 12, name: 'Rua-poto',                 constellation: "Solstice d'hiver",     marker: 'Sun',            dec: 23.44,   color: RUA_COLORS[11] },
] as const;

// ── Pou (10 celestial pillars) ───────────────────────────────────────

export const POU: readonly Pou[] = [
  { num: 1,  name: 'Pou-mua',                  anaStar: "'Ana-mua",       westernStar: 'Antares',            ra: 16.4901, dec: -26.432, pm_ra: -12.11,  pm_dec: -23.32,  color: POU_COLORS[0] },
  { num: 2,  name: 'Pou-muri',                 anaStar: "'Ana-muri",      westernStar: 'Zuben-Eschamali',    ra: 14.8481, dec: -16.042, pm_ra: -97.67,  pm_dec: -41.40,  color: POU_COLORS[1] },
  { num: 3,  name: 'Pou-roto',                 anaStar: "'Ana-roto",      westernStar: 'Regulus',            ra: 10.1395, dec:  11.967, pm_ra: -248.73, pm_dec: 5.59,    color: POU_COLORS[2] },
  { num: 4,  name: "Pou-tia'ira'a",            anaStar: "'Ana-tipu",      westernStar: 'Dubhe',              ra: 11.0621, dec:  61.751, pm_ra: -134.10, pm_dec: -34.70,  color: POU_COLORS[3] },
  { num: 5,  name: "Pou-'orerorerora'a",        anaStar: "'Ana-heuheupo",  westernStar: 'Alphard',            ra:  8.9798, dec:  -8.659, pm_ra: -14.44,  pm_dec: 33.19,   color: POU_COLORS[4] },
  { num: 6,  name: "Pou-vana'ana'ara'a",        anaStar: "'Ana-tahu'a",   westernStar: 'Arcturus',           ra: 14.2612, dec:  19.182, pm_ra: -1093.45,pm_dec: -1999.40, color: POU_COLORS[5] },
  { num: 7,  name: "Pou-ti'ara'a",              anaStar: "'Ana-varu-vahine",westernStar: 'Procyon',            ra:  7.6550, dec:   5.225, pm_ra: -495.30, pm_dec: -102.70,  color: POU_COLORS[6] },
  { num: 8,  name: 'Pou-nohora\'a',            anaStar: "'Ana-varu",      westernStar: 'Betelgeuse',         ra:  5.9194,  dec:   7.407, pm_ra: 27.54,   pm_dec: 11.30,   color: POU_COLORS[7] },
  { num: 9,  name: 'Pou-haerera\'a',            anaStar: "'Ana-iva",       westernStar: 'Phaet (a Col)',      ra:  5.2400,  dec: -32.35,  pm_ra: -16.07,  pm_dec: 10.76,   color: POU_COLORS[8] },
  { num: 10, name: "Pou-fa'arava'aira'a",      anaStar: "'Ana-ni'a",      westernStar: 'Polaris',            ra:  2.5302,  dec:  89.264,  pm_ra: 44.22,   pm_dec: -11.74,  color: POU_COLORS[9] },
] as const;

// ── 'Avei'a (zenith stars by island) ──────────────────────────────────

export const AVEIA: readonly Aveia[] = [
  { island: "Tahiti / Huahine / Ra'iatea", star: "Ta'urua-faupapa", western: 'Sirius',    dec: -16.72 },
  { island: 'Nuku-Hiva',                       star: "Ta'urua-feufeu",  western: 'Alphard',   dec:  -8.66 },
  { island: "Hawai'i",                         star: "'Ana-tahu'a",    western: 'Arcturus',  dec:  19.18 },
  { island: "Hiva-'Oa",                         star: 'Tutahi',           western: 'Rigel',      dec:  -8.20 },
] as const;