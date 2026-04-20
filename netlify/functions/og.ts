import type { Handler, HandlerEvent } from "@netlify/functions";
import * as Astronomy from "astronomy-engine";
import satori from "satori";
import { html } from "satori-html";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import { readFile } from "fs/promises";
import { join } from "path";

// ═══════════════════════════════════════════════════════════════════════
// Section 1 — Constants
// Source: src/core/constants.ts, src/features/jewish-feasts.ts,
//         src/features/christian-feasts.ts, src/features/islamic-feasts.ts
// ═══════════════════════════════════════════════════════════════════════

const MS_PER_DAY = 86400000;
const JULIAN_UNIX_EPOCH = 2440587.5;
const J2000 = 2451545.0;
const GREGORIAN_CUTOVER_JD = 2299161;
const ENOCH_YEAR_DAYS = 364;
const ENOCH_OUT_OF_TIME_START = 364;

const MONTH_NAMES_FR = [
  "", "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
] as const;

const MONTH_NAMES_LONG_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
] as const;

const DOW_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] as const;
const DOW_ENOCH_NAMES = ["Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche", "Lundi", "Mardi"] as const;

const MONTH_NAMES_HEBREW: string[] = ['', 'Tishri', 'Heshvan', 'Kislev', 'Tevet', 'Shevat',
  'Adar', 'Nissan', 'Iyar', 'Sivan', 'Tammouz', 'Av', 'Eloul'];

// ── Jerusalem observer coordinates (src/features/hebrew.ts:4-6) ──────
const JERUSALEM_LAT = 31.7784;
const JERUSALEM_LON = 35.2066;
const JERUSALEM_ALT = 754;

// ── Moon phase boundaries (src/core/constants.ts:138-147) ───────────
interface MoonPhaseDef { max: number; name: string }
const MOON_PHASE_BOUNDARIES: MoonPhaseDef[] = [
  { max: 4,   name: "Nouvelle Lune" },
  { max: 84,  name: "Croissant croissant" },
  { max: 96,  name: "Premier Quartier" },
  { max: 176, name: "Gibbeuse croissante" },
  { max: 184, name: "Pleine Lune" },
  { max: 264, name: "Gibbeuse décroissante" },
  { max: 276, name: "Dernier Quartier" },
  { max: 356, name: "Croissant décroissant" },
];

// ── Tarena calendar (src/core/constants.ts:151-182) ──────────────────
interface TarenaDef { day: number; name: string; energy: number }
const TARENA: TarenaDef[] = [
  { day: 1,  name: "Tīreo", energy: 3 },
  { day: 2,  name: "Hirohiti", energy: 2 },
  { day: 3,  name: "Hoata", energy: 3 },
  { day: 4,  name: "Hāmiami mua", energy: 3 },
  { day: 5,  name: "Hāmiami roto", energy: 3 },
  { day: 6,  name: "Hāmiami muri", energy: 3 },
  { day: 7,  name: "'Ore'ore mua", energy: 1 },
  { day: 8,  name: "'Ore'ore muri", energy: 1 },
  { day: 9,  name: "Tamatea", energy: 2 },
  { day: 10, name: "Huna", energy: 1 },
  { day: 11, name: "Rapu", energy: 2 },
  { day: 12, name: "Maharu", energy: 1 },
  { day: 13, name: "'Ohua", energy: 3 },
  { day: 14, name: "Maitū", energy: 3 },
  { day: 15, name: "Hotu", energy: 3 },
  { day: 16, name: "Māra'i", energy: 3 },
  { day: 17, name: "Turu", energy: 3 },
  { day: 18, name: "Rā'au mua", energy: 1 },
  { day: 19, name: "Rā'au roto", energy: 1 },
  { day: 20, name: "Rā'au muri", energy: 1 },
  { day: 21, name: "'Ore'ore mua", energy: 1 },
  { day: 22, name: "'Ore'ore roto", energy: 1 },
  { day: 23, name: "'Ore'ore muri", energy: 2 },
  { day: 24, name: "Ta'aroa mua", energy: 3 },
  { day: 25, name: "Ta'aroa roto", energy: 3 },
  { day: 26, name: "Ta'aroa muri", energy: 3 },
  { day: 27, name: "Tāne", energy: 3 },
  { day: 28, name: "Ro'onui", energy: 1 },
  { day: 29, name: "Ro'o Mauri", energy: 1 },
  { day: 30, name: "Mutu", energy: 1 },
];

// ── Season colors ────────────────────────────────────────────────────
const SEASON_COLORS: Record<string, [number, number, number]> = {
  Printemps: [160, 230, 175],
  "Été": [255, 220, 140],
  Automne: [210, 175, 240],
  Hiver: [160, 205, 240],
};


// ── Enoch months (src/core/constants.ts:242+) ───────────────────────
interface EnochMonthDef { days: number; name: string; season: string }
const ENOCH_MONTHS: EnochMonthDef[] = [
  { days: 31, name: "Mois 1",  season: "Printemps" },
  { days: 30, name: "Mois 2",  season: "Printemps" },
  { days: 30, name: "Mois 3",  season: "Printemps" },
  { days: 31, name: "Mois 4",  season: "Été" },
  { days: 30, name: "Mois 5",  season: "Été" },
  { days: 30, name: "Mois 6",  season: "Été" },
  { days: 31, name: "Mois 7",  season: "Automne" },
  { days: 30, name: "Mois 8",  season: "Automne" },
  { days: 30, name: "Mois 9",  season: "Automne" },
  { days: 31, name: "Mois 10", season: "Hiver" },
  { days: 30, name: "Mois 11", season: "Hiver" },
  { days: 30, name: "Mois 12", season: "Hiver" },
];

// ── Biblical events (src/core/constants.ts:301-402) ──────────────────
interface BiblicalEventDef { r: string; m: number; d: number; dr: number[] | null; k: string; t: string }

const BIBLICAL_EVENTS: BiblicalEventDef[] = [
  { r: "Genèse 7:11", m: 2, d: 17, dr: null, k: "Déluge", t: "Début du déluge — toutes les sources du grand abîme jaillissent" },
  { r: "Genèse 8:4", m: 7, d: 17, dr: null, k: "Repos", t: "L'arche s'arrête sur les montagnes d'Ararat" },
  { r: "Genèse 8:5", m: 10, d: 1, dr: null, k: "Déluge", t: "Les eaux diminuent, les sommets des montagnes deviennent visibles" },
  { r: "Genèse 8:13", m: 1, d: 1, dr: null, k: "Assèchement", t: "Les eaux s'assèchent sur la terre (601e année de Noé)" },
  { r: "Genèse 8:14", m: 2, d: 27, dr: null, k: "Restauration", t: "La terre est complètement sèche" },
  { r: "Exode 12:2-3", m: 1, d: 10, dr: null, k: "Préparation", t: "Choix de l'agneau pascal — ce mois sera le premier de l'année" },
  { r: "Exode 12:6", m: 1, d: 14, dr: null, k: "Délivrance", t: "Immolation de l'agneau pascal au soir" },
  { r: "Exode 12:15", m: 1, d: 15, dr: null, k: "Départ", t: "Départ effectif d'Égypte — premier jour des pains sans levain" },
  { r: "Exode 12:18", m: 1, d: 14, dr: [14, 21], k: "Délivrance", t: "Fête des pains sans levain (du 14e au 21e jour)" },
  { r: "Exode 16:1", m: 2, d: 15, dr: null, k: "Murmure", t: "Murmures avant la manne dans le désert de Sin" },
  { r: "Exode 19:1", m: 3, d: 15, dr: null, k: "Arrivée", t: "Arrivée au désert de Sinaï — même jour que le départ d'Égypte" },
  { r: "Lévitique 23:15-21", m: 3, d: 6, dr: null, k: "Semaines", t: "Fête des Semaines (Shavouot), 50 jours après l'omer" },
  { r: "Nombres 28:26-31", m: 3, d: 6, dr: null, k: "Prémices", t: "Jour des prémices (Shavouot), sainte convocation" },
  { r: "Deutéronome 16:9-12", m: 3, d: 6, dr: null, k: "Semaines", t: "Fête des Semaines, célébrée avec offrandes et joie" },
  { r: "Exode 40:2", m: 1, d: 1, dr: null, k: "Tabernacle", t: "Ordre d'élever le tabernacle le premier jour du premier mois" },
  { r: "Exode 40:17", m: 1, d: 1, dr: null, k: "Tabernacle", t: "Érection effective du tabernacle (deuxième année)" },
  { r: "Lévitique 23:5", m: 1, d: 14, dr: null, k: "Pâque", t: "La Pâque de l'Éternel commence au crépuscule le quatorzième jour" },
  { r: "Lévitique 23:6", m: 1, d: 15, dr: [15, 21], k: "Azymes", t: "Début de la fête des pains sans levain — sept jours" },
  { r: "Lévitique 23:24", m: 7, d: 1, dr: null, k: "Trompettes", t: "Jour du son de la trompette — mémorial et sainte convocation" },
  { r: "Lévitique 23:27", m: 7, d: 10, dr: null, k: "Expiation", t: "Jour de l'expiation — sainte convocation et affliction des âmes" },
  { r: "Lévitique 23:34", m: 7, d: 15, dr: [15, 21], k: "Cabanes", t: "Fête des cabanes (Tabernacles) — sept jours" },
  { r: "Lévitique 23:39", m: 7, d: 15, dr: [15, 22], k: "Cabanes", t: "Fête des cabanes avec huitième jour d'assemblée solennelle" },
  { r: "1 Hénoch 60:1", m: 7, d: 14, dr: null, k: "Vision de Noé", t: "Léviathan et Béhémoth" },
  { r: "Nombres 1:1", m: 2, d: 1, dr: null, k: "Dénombrement", t: "Premier recensement dans le désert de Sinaï" },
  { r: "Nombres 9:1", m: 1, d: 1, dr: null, k: "Pâque", t: "Instruction de la Pâque dans le désert" },
  { r: "Nombres 9:11", m: 2, d: 14, dr: null, k: "Pâque", t: "Seconde Pâque pour ceux qui étaient impurs" },
  { r: "Nombres 10:11", m: 2, d: 20, dr: null, k: "Départ", t: "Départ du Sinaï — la nuée s'élève" },
  { r: "Nombres 20:1", m: 1, d: 1, dr: null, k: "Mort", t: "Mort de Miriam à Kadès" },
  { r: "Nombres 33:3", m: 1, d: 15, dr: null, k: "Départ", t: "Départ de Ramsès — lendemain de la Pâque" },
  { r: "Nombres 33:38", m: 5, d: 1, dr: null, k: "Mort", t: "Mort d'Aaron sur le mont Hor (40e année)" },
  { r: "Deutéronome 1:3", m: 11, d: 1, dr: null, k: "Discours", t: "Moïse parle au peuple" },
  { r: "Josué 4:19", m: 1, d: 10, dr: null, k: "Traversée", t: "Entrée en Canaan par le Jourdain" },
  { r: "1 Rois 6:1", m: 2, d: 1, dr: null, k: "Construction", t: "Début du temple de Salomon (4e année, 2e mois)" },
  { r: "1 Rois 6:38", m: 8, d: 1, dr: null, k: "Achèvement", t: "Achèvement du temple de Salomon (7 ans)" },
  { r: "1 Rois 8:2", m: 7, d: 15, dr: null, k: "Dédicace", t: "Dédicace du temple à la fête des cabanes" },
  { r: "1 Rois 12:32", m: 8, d: 15, dr: null, k: "Apostasie", t: "Fausse fête de Jéroboam" },
  { r: "2 Chroniques 7:10", m: 7, d: 23, dr: null, k: "Congé", t: "Fin de la célébration de la dédicace" },
  { r: "2 Chroniques 29:17", m: 1, d: 1, dr: [1, 16], k: "Purification", t: "Purification du temple sous Ézéchias" },
  { r: "2 Chroniques 30:2", m: 2, d: 14, dr: null, k: "Pâque", t: "Pâque retardée d'Ézéchias" },
  { r: "2 Chroniques 35:1", m: 1, d: 14, dr: null, k: "Pâque", t: "Grande Pâque de Josias" },
  { r: "Esdras 3:1", m: 7, d: 1, dr: null, k: "Autel", t: "Reconstruction de l'autel après le retour" },
  { r: "Esdras 3:6", m: 7, d: 1, dr: null, k: "Offrande", t: "Premières offrandes après le retour" },
  { r: "Esdras 6:15", m: 12, d: 3, dr: null, k: "Temple", t: "Achèvement du second temple" },
  { r: "Esdras 7:9", m: 1, d: 1, dr: null, k: "Voyage", t: "Début du voyage d'Esdras" },
  { r: "Esdras 7:9", m: 5, d: 1, dr: null, k: "Arrivée", t: "Arrivée d'Esdras à Jérusalem" },
  { r: "Esdras 10:16-17", m: 10, d: 1, dr: null, k: "Enquête", t: "Enquête sur les mariages mixtes" },
  { r: "Néhémie 6:15", m: 6, d: 25, dr: null, k: "Muraille", t: "Achèvement de la muraille de Jérusalem" },
  { r: "Néhémie 8:2", m: 7, d: 1, dr: null, k: "Lecture", t: "Lecture de la Loi par Esdras" },
  { r: "Néhémie 8:14", m: 7, d: 15, dr: [15, 21], k: "Cabanes", t: "Célébration de la fête des cabanes" },
  { r: "Esther 2:16", m: 10, d: 1, dr: null, k: "Rencontre", t: "Esther rencontre le roi" },
  { r: "Esther 3:12", m: 1, d: 13, dr: null, k: "Sort", t: "Tirage au sort et rédaction du décret d'extermination" },
  { r: "Esther 3:13", m: 12, d: 13, dr: null, k: "Complot", t: "Décret d'Haman pour détruire les Juifs" },
  { r: "Esther 8:12", m: 12, d: 13, dr: null, k: "Défense", t: "Contre-décret pour les Juifs" },
  { r: "Esther 9:1", m: 12, d: 13, dr: null, k: "Victoire", t: "Jour du combat et de la victoire des Juifs" },
  { r: "Esther 9:17", m: 12, d: 14, dr: null, k: "Repos", t: "Jour de repos et de festin" },
  { r: "Esther 9:18", m: 12, d: 15, dr: null, k: "Pourim", t: "Jour de célébration de Pourim" },
  { r: "Jérémie 36:9", m: 9, d: 5, dr: null, k: "Jeûne", t: "Jeûne proclamé, lecture du rouleau" },
  { r: "Jérémie 39:2", m: 4, d: 9, dr: null, k: "Brèche", t: "Brèche ouverte dans la muraille de Jérusalem" },
  { r: "Jérémie 52:4", m: 10, d: 10, dr: null, k: "Siège", t: "Début du siège de Jérusalem par Nebucadnetsar" },
  { r: "Jérémie 52:6", m: 4, d: 9, dr: null, k: "Famine", t: "Famine sévère pendant le siège" },
  { r: "Jérémie 52:12", m: 5, d: 10, dr: null, k: "Destruction", t: "Destruction du temple par Nebuzaradan" },
  { r: "Jérémie 52:31", m: 12, d: 25, dr: null, k: "Libération", t: "Libération de Jojakin de prison" },
  { r: "Ézéchiel 1:1-2", m: 4, d: 5, dr: null, k: "Révélation", t: "Vision des cieux ouverts" },
  { r: "Ézéchiel 8:1", m: 6, d: 5, dr: null, k: "Transport", t: "Vision — transport à Jérusalem" },
  { r: "Ézéchiel 20:1", m: 5, d: 10, dr: null, k: "Parole", t: "Parole aux anciens d'Israël" },
  { r: "Ézéchiel 24:1", m: 10, d: 10, dr: null, k: "Parabole", t: "Parabole de la marmite bouillante — début du siège" },
  { r: "Ézéchiel 29:1", m: 10, d: 12, dr: null, k: "Jugement", t: "Jugement contre l'Égypte" },
  { r: "Ézéchiel 29:17", m: 1, d: 1, dr: null, k: "Consolation", t: "Prophétie sur Nebucadnetsar et l'Égypte" },
  { r: "Ézéchiel 30:20", m: 1, d: 7, dr: null, k: "Bras", t: "Jugement sur le bras du Pharaon" },
  { r: "Ézéchiel 31:1", m: 3, d: 1, dr: null, k: "Allégorie", t: "Allégorie de l'Assyrie comme cèdre" },
  { r: "Ézéchiel 32:1", m: 12, d: 1, dr: null, k: "Lamentation", t: "Lamentation sur le Pharaon" },
  { r: "Ézéchiel 33:21", m: 10, d: 5, dr: null, k: "Nouvelles", t: "La chute de Jérusalem parvient aux exilés" },
  { r: "Ézéchiel 40:1", m: 1, d: 10, dr: null, k: "Temple", t: "Vision du temple idéal" },
  { r: "Daniel 10:4", m: 1, d: 24, dr: null, k: "Vision", t: "Vision surnaturelle" },
  { r: "Aggée 1:1", m: 6, d: 1, dr: null, k: "Exhortation", t: "Parole pour rebâtir le temple" },
  { r: "Aggée 1:15", m: 6, d: 24, dr: null, k: "Travail", t: "Début des travaux de reconstruction" },
  { r: "Aggée 2:1", m: 7, d: 21, dr: null, k: "Encouragement", t: "Encouragement divin pendant la fête des cabanes" },
  { r: "Aggée 2:10", m: 9, d: 24, dr: null, k: "Bénédiction", t: "Promesse de bénédiction" },
  { r: "Aggée 2:20", m: 9, d: 24, dr: null, k: "Zorobabel", t: "Promesse à Zorobabel" },
  { r: "Zacharie 1:1", m: 8, d: 1, dr: null, k: "Appel", t: "Appel à revenir à l'Éternel" },
  { r: "Zacharie 1:7", m: 11, d: 24, dr: null, k: "Songes", t: "Visions nocturnes de chevaux" },
  { r: "Zacharie 7:1", m: 9, d: 4, dr: null, k: "Question", t: "Question sur le jeûne et le deuil" },
  { r: "2 Rois 25:1", m: 10, d: 10, dr: null, k: "Siège", t: "Début du dernier siège de Jérusalem" },
  { r: "2 Rois 25:3", m: 4, d: 9, dr: null, k: "Famine", t: "Famine sévère dans la ville" },
  { r: "2 Rois 25:8", m: 5, d: 7, dr: null, k: "Destruction", t: "Nebuzaradan vient à Jérusalem" },
  { r: "2 Rois 25:25", m: 7, d: 1, dr: null, k: "Meurtre", t: "Assassinat de Guedalia" },
  { r: "Zacharie 8:19", m: 4, d: 17, dr: null, k: "Jeûne", t: "Jeûne du quatrième mois" },
  { r: "Zacharie 8:19", m: 5, d: 9, dr: null, k: "Jeûne", t: "Jeûne du cinquième mois" },
  { r: "Zacharie 8:19", m: 7, d: 3, dr: null, k: "Jeûne", t: "Jeûne du septième mois" },
  { r: "Zacharie 8:19", m: 10, d: 10, dr: null, k: "Jeûne", t: "Jeûne du dixième mois" },
  { r: "Matarii i ni a", m: 2, d: 29, dr: null, k: "Polynésie", t: "Dates polynésiennes" },
  { r: "Matarii i raro", m: 8, d: 28, dr: null, k: "Polynésie", t: "Dates polynésiennes" },
  { r: "Matariki", m: 9, d: 28, dr: null, k: "Polynésie", t: "Dates polynésiennes" },
  { r: "Matariki", m: 9, d: 29, dr: null, k: "Polynésie", t: "Dates polynésiennes" },
  { r: "Matariki", m: 9, d: 30, dr: null, k: "Polynésie", t: "Dates polynésiennes" },
  { r: "Matariki", m: 10, d: 1, dr: null, k: "Polynésie", t: "Dates polynésiennes" },
];

// ── Jewish feasts (src/features/jewish-feasts.ts:9-15) ──────────────
interface JewishFeastDef { n: string; m: number; d: number; t: string }
const JEWISH_FEASTS: JewishFeastDef[] = [
  { n: "Pessa'h",      m: 1,  d: 14, t: "14 au soir, Fête des pains sans levain" },
  { n: "Shavuot",      m: 3,  d: 6,  t: "Fête des Semaines — arrivée au désert de Sinaï" },
  { n: "Roch Hachana",  m: 7,  d: 1,  t: "Jour du son de la trompette — Nouvel An juif" },
  { n: "Yom Kippour",  m: 7,  d: 10, t: "Jour de l'expiation — jeûne et affliction des âmes" },
  { n: "Souccot",      m: 7,  d: 15, t: "Fête des cabanes — sept jours" },
];

// ── Christian feasts (src/features/christian-feasts.ts:57-69) ───────
interface ChristianFeastDef { n: string; o: number; t: string }
const CHRISTIAN_FEASTS: ChristianFeastDef[] = [
  { n: "Mercredi des Cendres", o: -46, t: "Début du Carême" },
  { n: "Rameaux",              o: -7,  t: "Entrée du Christ à Jérusalem" },
  { n: "Jeudi saint",          o: -3,  t: "Dernière Cène" },
  { n: "Vendredi saint",       o: -2,  t: "Crucifixion du Christ" },
  { n: "Samedi saint",         o: -1,  t: "Jour d'attente au tombeau" },
  { n: "Pâques",               o: 0,   t: "Résurrection du Christ" },
  { n: "Ascension",            o: 39,  t: "Ascension du Christ au ciel" },
  { n: "Pentecôte",            o: 49,  t: "Descente du Saint-Esprit" },
  { n: "Sainte Trinité",       o: 56,  t: "Fête de la Sainte Trinité" },
  { n: "Fête-Dieu",            o: 60,  t: "Fête du Corps et du Sang du Christ" },
  { n: "Sacré-Cœur",          o: 68,  t: "Fête du Sacré-Cœur de Jésus" },
];

// ── Islamic feasts (src/features/islamic-feasts.ts:19-28) ───────────
const SYNODIC = 29.53059;
const CRESCENT_OFF = 1.0;

interface IslamicFeastDayDef { hDay: number; n: string; t: string }
const FEAST_BY_MONTH: Record<number, IslamicFeastDayDef[]> = {
  1: [{ hDay: 1,  n: "1er Muharram", t: "Nouvelle année islamique" },
      { hDay: 10, n: "Achoura", t: "Jour d'expiation" }],
  3: [{ hDay: 12, n: "Mawlid an-Nabi", t: "Naissance du prophète Muhammad" }],
  7: [{ hDay: 27, n: "Isra et Mi'raj", t: "Voyage nocturne et ascension" }],
  9: [{ hDay: 1,  n: "Ramadan", t: "Début du jeûne — 30 jours" },
      { hDay: 27, n: "Laylat al-Qadr", t: "Nuit du Destin" }],
  10: [{ hDay: 1, n: "Eid al-Fitr", t: "Fête de la rupture du jeûne" }],
  12: [{ hDay: 10, n: "Eid al-Adha", t: "Fête du Sacrifice" }],
};

// ═══════════════════════════════════════════════════════════════════════
// Section 2 — Date Conversion Functions
// Source: src/core/time.ts:33-140, src/core/date-utils.ts
// ═══════════════════════════════════════════════════════════════════════

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
}

function daysInMonth(y: number, m: number): number {
  const lengths = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return m === 2 && isLeapYear(y) ? 29 : lengths[m];
}

function formatYear(y: number): string {
  return y <= 0 ? `-${Math.abs(y - 1)} ` : `${y}`;
}

/** Shared core for JD→Calendar (src/core/time.ts:33-55) */
interface CalDate { year: number; month: number; day: number }
function calendarFromZ(Z: number, F: number, useGregorian: boolean): CalDate {
  let A: number;
  if (useGregorian) {
    const alpha = Math.floor((Z - 1867216.25) / 36524.25);
    A = Z + 1 + alpha - Math.floor(alpha / 4);
  } else {
    A = Z;
  }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const day = B - D - Math.floor(30.6001 * E);
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  return { year, month, day };
}

/** JD → Gregorian calendar (proleptic Gregorian, always applies B correction) */
function jdToCalendar(jd: number): CalDate {
  const jdp = jd + 0.5;
  const Z = Math.floor(jdp);
  const F = jdp - Z;
  return calendarFromZ(Z, F, true);
}

/** JD → Julian (proleptic) calendar */
function jdToJulianCalendar(jd: number): CalDate {
  const jdp = jd + 0.5;
  const Z = Math.floor(jdp);
  const F = jdp - Z;
  return calendarFromZ(Z, F, false);
}

/** Gregorian calendar → JD (proleptic Gregorian, src/core/time.ts:104-111) */
function calendarToJD(year: number, month: number, day: number): number {
  let Y = year, M = month;
  if (M <= 2) { Y--; M += 12; }
  const A = Math.floor(Y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + day + B - 1524.5;
}

/** Julian calendar → JD (no Gregorian correction, src/core/time.ts:123-128) */
function julianCalendarToJD(year: number, month: number, day: number): number {
  let Y = year, M = month;
  if (M <= 2) { Y--; M += 12; }
  return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + day - 1524.5;
}

/** Date object → JD */
function dateToJD(d: Date): number {
  return d.getTime() / MS_PER_DAY + JULIAN_UNIX_EPOCH;
}

/** JD → day-of-week name (Monday=0) */
function dowFromJD(jd: number): string {
  return DOW_NAMES[Math.floor(jd + 0.5) % 7];
}

/** JD → Enoch day-of-week name */
function dowEnochFromJD(jd: number): string {
  return DOW_ENOCH_NAMES[Math.floor(jd + 0.5) % 7];
}

// ═══════════════════════════════════════════════════════════════════════
// Section 3 — Seasons / Equinox / Solstice
// Source: src/features/seasons.ts:27-105
// ═══════════════════════════════════════════════════════════════════════

interface SeasonJDs { vernal: number; summer: number; autumnal: number; winter: number }
const seasonsJDCache: Record<number, SeasonJDs | null> = {};

/**
 * Get season JDs for a given year.
 * - Years 0-99: +2000 year workaround (src/features/seasons.ts:30-46)
 * - Years 100-275760: Astronomy.Seasons() directly
 * - Out of range: Meeus polynomial approximation
 */
function getSeasonJDsForYear(year: number): SeasonJDs | null {
  if (seasonsJDCache[year] !== undefined) return seasonsJDCache[year];

  // Approximation for extreme dates (src/features/seasons.ts:76-85)
  function getApproxSeasonJDs(y: number): SeasonJDs {
    const Y = (y - 2000) / 1000;
    const marchEquinoxJD = 2451623.80984 + 365242.37404 * Y + 0.05169 * Y * Y - 0.00411 * Y * Y * Y - 0.00057 * Y * Y * Y * Y;
    return {
      vernal:   marchEquinoxJD,
      summer:   marchEquinoxJD + 93.8283,
      autumnal: marchEquinoxJD + 186.3847,
      winter:   marchEquinoxJD + 278.9418,
    };
  }

  try {
    if (year >= 0 && year <= 99) {
      // +2000 year workaround: compute at year+2000, subtract offset
      const s = Astronomy.Seasons(year + 2000);
      const offsetMs = 2000 * 365.2425 * MS_PER_DAY;
      const r: SeasonJDs = {
        vernal:   (s.mar_equinox.date.getTime() - offsetMs) / MS_PER_DAY + JULIAN_UNIX_EPOCH,
        summer:   (s.jun_solstice.date.getTime() - offsetMs) / MS_PER_DAY + JULIAN_UNIX_EPOCH,
        autumnal: (s.sep_equinox.date.getTime() - offsetMs) / MS_PER_DAY + JULIAN_UNIX_EPOCH,
        winter:   (s.dec_solstice.date.getTime() - offsetMs) / MS_PER_DAY + JULIAN_UNIX_EPOCH,
      };
      seasonsJDCache[year] = r;
      return r;
    }

    if (year > 99 && year <= 275760) {
      const s = Astronomy.Seasons(year);
      const vYear = s.mar_equinox.date.getUTCFullYear();
      if (Math.abs(vYear - year) > 1) {
        seasonsJDCache[year] = null;
        return null;
      }
      const r: SeasonJDs = {
        vernal:   dateToJD(s.mar_equinox.date),
        summer:   dateToJD(s.jun_solstice.date),
        autumnal: dateToJD(s.sep_equinox.date),
        winter:   dateToJD(s.dec_solstice.date),
      };
      seasonsJDCache[year] = r;
      return r;
    }

    // Extreme dates: Meeus approximation
    const r = getApproxSeasonJDs(year);
    seasonsJDCache[year] = r;
    return r;
  } catch {
    const r = getApproxSeasonJDs(year);
    seasonsJDCache[year] = r;
    return r;
  }
}


// ═══════════════════════════════════════════════════════════════════════
// Section 4 — Moon Phase & Tarena
// Source: src/core/moon-utils.ts, src/core/formatters.ts
// ═══════════════════════════════════════════════════════════════════════

function getMoonPhaseName(deg: number): string {
  const v = ((deg % 360) + 360) % 360;
  if (v < 4 || v >= 356) return "Nouvelle Lune";
  for (const p of MOON_PHASE_BOUNDARIES) if (v < p.max) return p.name;
  return "Nouvelle Lune";
}

function getLastNewMoonJD(date: Date): number {
  const astroTime = new Astronomy.AstroTime(date);
  const nm = Astronomy.SearchMoonPhase(0, astroTime, -45);
  if (!nm) {
    const fallback = new Date(date.getTime() - 30 * MS_PER_DAY);
    const nm2 = Astronomy.SearchMoonPhase(0, new Astronomy.AstroTime(fallback), 60);
    if (nm2) return nm2.date.getTime() / MS_PER_DAY + JULIAN_UNIX_EPOCH;
    return 0;
  }
  return nm.date.getTime() / MS_PER_DAY + JULIAN_UNIX_EPOCH;
}

function getTarenaDay(date: Date, isNorth: boolean): TarenaDef {
  const jd = date.getTime() / MS_PER_DAY + JULIAN_UNIX_EPOCH;
  const nlJD = getLastNewMoonJD(date);
  const daysSinceNL = jd - nlJD;

  let lunarDay = Math.min(Math.floor(daysSinceNL) + 1, 30);
  lunarDay = Math.max(lunarDay, 1);

  let targetDay = isNorth
    ? (lunarDay === 1 ? 1 : 32 - lunarDay)
    : lunarDay;
  targetDay = Math.min(Math.max(targetDay, 1), 30);
  return (TARENA.find(t => t.day === targetDay) || TARENA[0]);
}

/** Moon phase angle via astronomy-engine directly (replaces custom LUNATION formula) */
function getMoonPhaseAtJD(jd: number): number {
  try {
    return Astronomy.MoonPhase(new Astronomy.AstroTime(jd - J2000));
  } catch {
    // Low-precision fallback
    const D = jd - J2000;
    const g = ((357.529 + 0.98560028 * D) * Math.PI) / 180;
    const q = 280.459 + 0.98564736 * D;
    return (((q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) % 360) + 360) % 360;
  }
}

function getMoonInfo(jd: number): { name: string; fraction: number; phaseDeg: number } {
  const phaseDeg = ((getMoonPhaseAtJD(jd) % 360) + 360) % 360;
  try {
    const at = new Astronomy.AstroTime(jd - J2000);
    const illum = Astronomy.Illumination(Astronomy.Body.Moon, at);
    return { name: getMoonPhaseName(phaseDeg), fraction: illum.phase_fraction, phaseDeg };
  } catch {
    const frac = (1 - Math.cos(phaseDeg * Math.PI / 180)) / 2;
    return { name: getMoonPhaseName(phaseDeg), fraction: frac, phaseDeg };
  }
}

/** Find new moon nearest to targetJD using astronomy-engine's optimized search */
function findNewMoonJD(targetJD: number): number {
  try {
    const searchDate = new Date(((targetJD - 20) - JULIAN_UNIX_EPOCH) * MS_PER_DAY);
    const searchTime = new Astronomy.AstroTime(searchDate);
    const result = Astronomy.SearchMoonPhase(0, searchTime, 40);
    if (result) return result.ut + J2000;
  } catch { /* fallback below */ }
  return targetJD;
}

// ═══════════════════════════════════════════════════════════════════════
// Section 5 — Enoch Calendar
// Source: src/features/enoch.ts:114-191
// ═══════════════════════════════════════════════════════════════════════

interface EnochResult {
  preciseDay: number;
  curDay: number;
  monthIdx: number;
  dayInMonth: number;
  outOfTime: boolean;
}

/** Sun ecliptic longitude at a given JD (polynomial fallback for Enoch Path B) */
function getSunEclipticLon(jd: number): number {
  try {
    return Astronomy.SunPosition(new Astronomy.AstroTime(jd - J2000)).elon;
  } catch {
    const D = jd - J2000;
    const g = ((357.529 + 0.98560028 * D) * Math.PI) / 180;
    const q = 280.459 + 0.98564736 * D;
    return (((q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) % 360) + 360) % 360;
  }
}

/** Enoch calendar computation — always UTC in serverless (tzOffset=0) */
function computeEnochDay(jd: number, hem: "N" | "S"): EnochResult {
  const dayIndex = Math.floor(jd + 0.5);
  const yr = jdToCalendar(jd).year;
  const seasonKey: keyof SeasonJDs = hem === "S" ? "autumnal" : "vernal";

  // Path A: search for precise equinox
  let eqJD: number | null = null;
  for (const y of [yr + 1, yr, yr - 1]) {
    const s = getSeasonJDsForYear(y);
    if (s && s[seasonKey]) {
      const candidateDay = Math.floor(s[seasonKey] + 0.5);
      if (candidateDay <= dayIndex) {
        eqJD = s[seasonKey];
        break;
      }
    }
  }

  let preciseDay: number;
  let curDay: number;

  if (eqJD !== null) {
    preciseDay = jd - (Math.floor(eqJD + 0.5) - 0.5);
    curDay = dayIndex - Math.floor(eqJD + 0.5);
  } else {
    // Path B: sun ecliptic longitude fallback
    const sunLon = getSunEclipticLon(jd);
    const hemOffset = hem === "S" ? 180 : 0;
    const effectiveLon = ((sunLon - hemOffset + 360) % 360);
    preciseDay = (effectiveLon / 360) * ENOCH_YEAR_DAYS;
    curDay = Math.floor(preciseDay);
  }

  const outOfTime = curDay < 0 || curDay >= ENOCH_OUT_OF_TIME_START;
  const mappedDay = outOfTime ? Math.max(0, Math.min(curDay, ENOCH_YEAR_DAYS - 1)) : curDay;

  let monthIdx = 0;
  let dayInMonth = 1;
  let cum = 0;
  for (let i = 0; i < 12; i++) {
    if (mappedDay >= cum && mappedDay < cum + ENOCH_MONTHS[i].days) {
      monthIdx = i;
      dayInMonth = mappedDay - cum + 1;
      break;
    }
    cum += ENOCH_MONTHS[i].days;
  }

  return { preciseDay, curDay, monthIdx, dayInMonth, outOfTime };
}

// ═══════════════════════════════════════════════════════════════════════
// Section 6 — Hebrew Calendar with Sunset Logic
// Source: src/features/hebrew.ts:103-366
// ═══════════════════════════════════════════════════════════════════════

interface HebrewResult {
  day: number;
  month: number;
  monthLength: number;
  hebrewYear: number;
  monthName: string;
}

function isEmb(y: number): boolean {
  const p = ((y - 1) % 19) + 1;
  return p === 3 || p === 6 || p === 8 || p === 11 || p === 14 || p === 17 || p === 19;
}

function getElapsedMonths(y: number): number {
  const ym1 = y - 1;
  const cycles = Math.floor(ym1 / 19);
  const yearsInCycle = ym1 % 19;
  return cycles * 235 + Math.floor((yearsInCycle * 235) / 19);
}

/** Rosh Hashana JDN — anchor is 347997 (src/features/hebrew.ts:234) */
function getRoshHashanaJDN(y: number): number {
  const M = getElapsedMonths(y);
  const totalParts = 31524 + M * 765433;
  const d = Math.floor(totalParts / 25920);
  const t = totalParts % 25920;
  let dw = d % 7;

  let delay = 0;
  let isZaken = false;

  if (t >= 19440) { delay = 1; dw = (dw + 1) % 7; isZaken = true; }
  if (dw === 0 || dw === 3 || dw === 5) { delay += 1; }
  else if (dw === 2 && t >= 9924 && !isEmb(y) && !isZaken) { delay += 2; }
  else if (dw === 1 && t >= 16789 && isEmb(y - 1) && !isZaken) { delay += 1; }

  return d + delay + 347997;
}

function findHebrewYear(jdn: number): number {
  const estimatedYear = Math.floor((jdn - 347998) / 365.2468) + 1;
  if (estimatedYear < 1) return 1;
  const rh = getRoshHashanaJDN(estimatedYear);
  if (jdn < rh) return estimatedYear - 1;
  const rhNext = getRoshHashanaJDN(estimatedYear + 1);
  if (jdn >= rhNext) return estimatedYear + 1;
  return estimatedYear;
}

interface HYInfo {
  year: number; jdn: number; len: number; leap: boolean;
  months: { n: number; day: number; len: number }[];
}

function buildHY(y: number): HYInfo {
  const j = getRoshHashanaJDN(y);
  const jn = getRoshHashanaJDN(y + 1);
  const len = jn - j;
  const lp = isEmb(y);
  let hv: number, kv: number;

  if (lp) {
    if (len <= 383) { hv = 29; kv = 29; }
    else if (len <= 384) { hv = 29; kv = 30; }
    else { hv = 30; kv = 30; }
  } else {
    if (len <= 353) { hv = 29; kv = 29; }
    else if (len <= 354) { hv = 29; kv = 30; }
    else { hv = 30; kv = 30; }
  }

  const md = lp
    ? [30, hv, kv, 29, 30, 30, 29, 30, 29, 30, 29, 30, 29]
    : [30, hv, kv, 29, 30, 29, 30, 29, 30, 29, 30, 29];

  let cum = 0;
  const ms = md.map((l, i) => { const n = i + 1; const info = { n, day: cum, len: l }; cum += l; return info; });
  return { year: y, jdn: j, len, leap: lp, months: ms };
}

/** Sunset JD in UTC via astronomy-engine (src/features/hebrew.ts:103-161) */
function getSunsetJDUTC(jdUTC: number, observer: Astronomy.Observer): number {
  const jdn = Math.floor(jdUTC + 0.5);
  // For OG (always UTC): localDayIndex = jdn, noon at 12:00 UTC
  const noonJD = jdn - 0.5 + 12 / 24;
  const noonDate = new Date((noonJD - JULIAN_UNIX_EPOCH) * MS_PER_DAY);

  try {
    const result = Astronomy.SearchRiseSet(
      Astronomy.Body.Sun, observer, -1, noonDate, 1,
    );
    if (result) return result.date.getTime() / MS_PER_DAY + JULIAN_UNIX_EPOCH;
  } catch { /* fallback below */ }

  // Fallback: approximate sunset at 16:00 local (Jerusalem ~14:00 UTC)
  return jdn - 0.5 + 14 / 24;
}

/** Hebrew calendar computation with sunset (src/features/hebrew.ts:312-366) */
function computeHebrewFromJD(jdUTC: number): HebrewResult {
  const observer = new Astronomy.Observer(JERUSALEM_LAT, JERUSALEM_LON, JERUSALEM_ALT);
  const sunsetJD = getSunsetJDUTC(jdUTC, observer);

  // OG always UTC: no timezone offset
  const localDayIndex = Math.floor(jdUTC + 0.5);
  const localDayFraction = jdUTC - (localDayIndex - 0.5);
  const sunsetDayFraction = sunsetJD - (localDayIndex - 0.5);
  const jdnHebrew = localDayFraction >= sunsetDayFraction ? localDayIndex + 1 : localDayIndex;

  const y = findHebrewYear(jdnHebrew);
  const hy = buildHY(y);
  const doy = jdnHebrew - hy.jdn + 1;  // FIXED: was +2 in old og.ts

  const toBiblical = hy.leap
    ? [0, 7, 8, 9, 10, 11, 12, 13, 1, 2, 3, 4, 5, 6]
    : [0, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];

  if (doy < 1 || doy > hy.len)
    return { day: 1, month: 1, monthLength: 30, hebrewYear: y, monthName: "Tishri" };

  for (const mi of hy.months) {
    if (doy <= mi.day + mi.len) {
      const day = doy - mi.day;
      let name = MONTH_NAMES_HEBREW[mi.n];
      if (mi.n === 6 && hy.leap) name = "Adar I";
      if (mi.n === 7 && hy.leap) name = "Adar II";
      return { day, month: toBiblical[mi.n], monthLength: mi.len, hebrewYear: y, monthName: name };
    }
  }
  return { day: 1, month: 7, monthLength: 30, hebrewYear: y, monthName: "Tishri" };
}

// ═══════════════════════════════════════════════════════════════════════
// Section 7 — Christian, Islamic, Jewish, Biblical Feast Lookups
// Source: src/features/christian-feasts.ts, islamic-feasts.ts,
//         jewish-feasts.ts, biblical-events.ts
// ═══════════════════════════════════════════════════════════════════════

// ── Christian feasts ─────────────────────────────────────────────────

function computeEaster(year: number): { m: number; d: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mm = Math.floor((a + 11 * h + 22 * l) / 451);
  return {
    m: Math.floor((h + l - 7 * mm + 114) / 31),
    d: ((h + l - 7 * mm + 114) % 31) + 1,
  };
}

function addDaysToGregorian(y: number, m: number, d: number, offset: number): { m: number; d: number } {
  let day = d + offset, month = m;
  while (day > daysInMonth(y, month)) { day -= daysInMonth(y, month); month++; }
  while (day < 1) { month--; if (month < 1) { month = 12; y--; } day += daysInMonth(y, month); }
  return { m: month, d: day };
}

let cachedChristianYear = 0;
let cachedChristianFeasts: { n: string; t: string; m: number; d: number }[] = [];

function getChristianFeastsForDate(year: number, month: number, day: number): { n: string; t: string }[] {
  if (cachedChristianYear !== year) {
    const easter = computeEaster(year);
    cachedChristianFeasts = CHRISTIAN_FEASTS.map(def => {
      const r = addDaysToGregorian(year, easter.m, easter.d, def.o);
      return { n: def.n, t: def.t, m: r.m, d: r.d };
    });
    cachedChristianYear = year;
  }
  return cachedChristianFeasts.filter(f => f.m === month && f.d === day).map(f => ({ n: f.n, t: f.t }));
}

// ── Islamic feasts ───────────────────────────────────────────────────

let cachedIslamicYear = 0;
let cachedIslamicFeasts: { n: string; t: string; m: number; d: number }[] = [];

function getIslamicFeastsForDate(gregYear: number, gregMonth: number, gregDay: number): { n: string; t: string }[] {
  if (cachedIslamicYear !== gregYear) {
    const results: { n: string; t: string; m: number; d: number }[] = [];
    for (const anchorMonth of [1, 7]) {
      const anchorJD = calendarToJD(gregYear, anchorMonth, 1);
      const prevJD = calendarToJD(gregYear - 1, 7, 1);
      for (const nmBase of [prevJD, anchorJD]) {
        const nmJD = findNewMoonJD(nmBase);
        for (let i = 0; i < 12; i++) {
          const hMonth = (i % 12) + 1;
          const crescentJD = Math.round(nmJD + i * SYNODIC + CRESCENT_OFF);
          const feastDays = FEAST_BY_MONTH[hMonth] || [];
          for (const fd of feastDays) {
            const g = jdToCalendar(crescentJD + fd.hDay - 1);
            if (g.year !== gregYear) continue;
            if (results.some(r => r.n === fd.n && r.m === g.month && r.d === g.day)) continue;
            results.push({ n: fd.n, t: fd.t, m: g.month, d: g.day });
          }
        }
      }
    }
    results.sort((a, b) => a.m - b.m || a.d - b.d);
    cachedIslamicFeasts = results;
    cachedIslamicYear = gregYear;
  }
  return cachedIslamicFeasts.filter(f => f.m === gregMonth && f.d === gregDay).map(f => ({ n: f.n, t: f.t }));
}

// ── Jewish feasts ────────────────────────────────────────────────────

function getJewishFeastsForHebrewDay(hebrewMonth: number, hebrewDay: number): { n: string; t: string }[] {
  return JEWISH_FEASTS.filter(f => f.m === hebrewMonth && f.d === hebrewDay).map(f => ({ n: f.n, t: f.t }));
}

function getJewishFeastsForEnochDay(enochMonthIdx: number, enochDayInMonth: number): { n: string; t: string }[] {
  const bibMonth = enochMonthIdx + 1;
  return JEWISH_FEASTS.filter(f => f.m === bibMonth && f.d === enochDayInMonth).map(f => ({ n: f.n, t: f.t }));
}

// ── Biblical events (with day_range support) ─────────────────────────

function getRestDayNumber(curDay: number): number | null {
  if (curDay < 0 || curDay % 7 !== 6) return null;
  return Math.floor(curDay / 7) + 1;
}

function getMatchingBiblicalEvents(enochMonthIdx: number, enochDayInMonth: number): { r: string; t: string }[] {
  const bibMonth = enochMonthIdx + 1;
  return BIBLICAL_EVENTS
    .filter(ev => {
      if (ev.m !== bibMonth) return false;
      if (ev.dr) return enochDayInMonth >= ev.dr[0] && enochDayInMonth <= ev.dr[1];
      return ev.d === enochDayInMonth;
    })
    .map(ev => ({ r: ev.r, t: ev.t }));
}

// ═══════════════════════════════════════════════════════════════════════
// Section 9 — Moon HTML Rendering + Glow
// ═══════════════════════════════════════════════════════════════════════

function renderMoonHtml(
  phaseDeg: number,
  fraction: number,
  isNorth: boolean,
  size: number,
): string {
  const phase = ((phaseDeg % 360) + 360) % 360;
  const waxing = phase < 180;
  const litOnRight = isNorth ? waxing : !waxing;
  const r = size / 2;

  const moonColor = "#e2dcc8";
  const darkColor = "#0a0e17";

  const boxShadow = `0 0 ${size * 0.25}px rgba(180,210,240,0.2), 0 0 ${size * 0.5}px rgba(180,210,240,0.08)`;

  // Full moon
  if (fraction > 0.999) {
    return `<div style="display:flex;width:${size}px;height:${size}px;border-radius:50%;background:${moonColor};box-shadow:${boxShadow};flex-shrink:0;"></div>`;
  }
  // New moon
  if (fraction < 0.001) {
    return `<div style="display:flex;width:${size}px;height:${size}px;border-radius:50%;background:${darkColor};border:1px solid rgba(255,255,255,0.06);flex-shrink:0;"></div>`;
  }

  // Half-disc + ellipse overlay technique
  const phaseRad = (phase * Math.PI) / 180;
  const cosP = Math.cos(phaseRad);
  const shadowEllipseW = Math.abs(cosP) * r;

  const leftColor = litOnRight ? darkColor : moonColor;
  const rightColor = litOnRight ? moonColor : darkColor;
  const isGibbous = phase > 90 && phase < 270;
  const ellipseColor = isGibbous ? moonColor : darkColor;

  const ellipseLeft = r - shadowEllipseW;
  const ellipseWidth = shadowEllipseW * 2;

  return `<div style="display:flex;position:relative;width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex-shrink:0;box-shadow:${boxShadow};">
    <div style="display:flex;width:${r}px;height:${size}px;background:${leftColor};"></div>
    <div style="display:flex;width:${r}px;height:${size}px;background:${rightColor};"></div>
    <div style="display:flex;position:absolute;left:${ellipseLeft.toFixed(2)}px;top:0;width:${ellipseWidth.toFixed(2)}px;height:${size}px;border-radius:50%;background:${ellipseColor};"></div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// Section 10 — HTML/CSS Modern Design + Handler
// ═══════════════════════════════════════════════════════════════════════

function renderGroupedEvents(
  title: string,
  items: { name: string; desc: string }[],
  color: string,
  glow: boolean = true,
): string {
  if (!items.length) return "";

  const pills = items
    .map(it => `<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;background:rgba(255,255,255,0.03);border-radius:8px;border-left:3px solid ${color};">
      <div style="display:flex;flex-direction:column;gap:2px;">
        <span style="font-size:16px;font-weight:600;color:rgba(240,245,255,0.95);font-family:'DM Mono',monospace;white-space:nowrap;">${it.name}</span>
        ${it.desc ? `<span style="font-size:13px;color:rgba(170,185,205,0.75);font-family:'DM Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${it.desc}</span>` : ""}
      </div>
    </div>`)
    .join("");

  const textShadow = glow ? `text-shadow:0 0 12px ${color};` : "";

  return `<div style="display:flex;flex-direction:column;margin-bottom:14px;">
    <span style="font-size:12px;font-weight:700;letter-spacing:2px;color:${color};text-transform:uppercase;margin-bottom:8px;font-family:'DM Mono',monospace;${textShadow}">${title} (${items.length})</span>
    <div style="display:flex;flex-direction:column;gap:4px;">${pills}</div>
  </div>`;
}

// ── WASM Initialization + Font Cache ────────────────────────────────

let wasmReady = false;
let fontCache: ArrayBuffer[] | null = null;

async function loadFont(localPath: string, cdnUrl: string): Promise<Buffer> {
  try { return await readFile(localPath); } catch {
    return Buffer.from(await (await fetch(cdnUrl)).arrayBuffer());
  }
}

async function ensureWasmAndFonts(): Promise<ArrayBuffer[]> {
  if (!wasmReady) {
    const [wasmBuf, ...fonts] = await Promise.all([
      readFile(join(process.cwd(), "node_modules/@resvg/resvg-wasm/index_bg.wasm")),
      loadFont(join(__dirname, "fonts", "dm-mono-400.woff"),
        "https://cdn.jsdelivr.net/npm/@fontsource/dm-mono@5/files/dm-mono-latin-400-normal.woff"),
      loadFont(join(__dirname, "fonts", "dm-mono-500.woff"),
        "https://cdn.jsdelivr.net/npm/@fontsource/dm-mono@5/files/dm-mono-latin-500-normal.woff"),
      loadFont(join(__dirname, "fonts", "cormorant-garamond-500i.woff"),
        "https://cdn.jsdelivr.net/npm/@fontsource/cormorant-garamond@5/files/cormorant-garamond-latin-500-italic.woff"),
    ]);
    await initWasm(wasmBuf);
    wasmReady = true;
    fontCache = fonts.map(b => b.buffer as ArrayBuffer);
  }
  return fontCache!;
}

// ── Handler ──────────────────────────────────────────────────────────

const handler: Handler = async (event: HandlerEvent) => {
  try {
    const [fontDM400, fontDM500, fontCG500i] = await ensureWasmAndFonts();

    // ── Parse parameters ──────────────────────────────────────────
    const params = event.queryStringParameters || {};
    let dateStr = params.date || "";
    let hem: "N" | "S" = params.hem === "S" ? "S" : "N";

    const pathMatch = (event.path || "").match(/\/og\/(-?\d{1,4}[-\/]\d{1,2}[-\/]-?\d{1,4})(?:\/(N|S))?/);
    if (pathMatch) {
      dateStr = pathMatch[1];
      if (pathMatch[2]) hem = pathMatch[2] as "N" | "S";
    }

    // ── Parse date ────────────────────────────────────────────────
    let year: number | undefined, month: number | undefined, day: number | undefined;
    if (dateStr) {
      const sep = dateStr.includes("/") ? "/" : "-";
      const parts = sep === "-" ? dateStr.split(/(?!^)-/).map(Number) : dateStr.split(sep).map(Number);
      if (parts.length === 3 && parts.every(n => !isNaN(n))) {
        if (sep === "/") { [day, month, year] = parts; }
        else { [year, month, day] = parts; }
      }
    }

    if (!year! || !month! || !day!) {
      const now = new Date();
      year = now.getUTCFullYear();
      month = now.getUTCMonth() + 1;
      day = now.getUTCDate();
    }

    month = Math.max(1, Math.min(12, month));
    day = Math.max(1, Math.min(daysInMonth(year!, month), day));

    // ── Core computations ─────────────────────────────────────────
    const jd = calendarToJD(year!, month, day);
    const dowGregorian = dowFromJD(jd);

    // Enoch: always UTC
    const en = computeEnochDay(jd, hem);

    // Hebrew: with sunset, Jerusalem observer
    const hb = computeHebrewFromJD(jd);

    // Moon: via astronomy-engine
    const moon = getMoonInfo(jd);
    const dateForTarena = new Date((jd - JULIAN_UNIX_EPOCH) * MS_PER_DAY);
    const tarenaDay = getTarenaDay(dateForTarena, hem === "N");

    // Biblical events with day_range
    const biblicalEvts = getMatchingBiblicalEvents(en.monthIdx, en.dayInMonth);

    // Rest day
    const restDay = getRestDayNumber(en.curDay);

    // Jewish feasts
    const jewishEvtsHebrew = getJewishFeastsForHebrewDay(hb.month, hb.day);
    const jewishEvtsEnoch = getJewishFeastsForEnochDay(en.monthIdx, en.dayInMonth);

    // Christian feasts (year-cached)
    const christianEvts = getChristianFeastsForDate(year!, month, day);

    // Islamic feasts (year-cached)
    const islamicEvts = getIslamicFeastsForDate(year!, month, day);

    // ── Julian calendar display for pre-Gregorian dates ───────────
    let julianDate: string | null = null;
    if (jd < GREGORIAN_CUTOVER_JD) {
      const jul = jdToJulianCalendar(jd);
      const julJD = julianCalendarToJD(jul.year, jul.month, jul.day);
      const dowJulian = dowFromJD(julJD);
      julianDate = `${dowJulian} ${String(jul.day).padStart(2, "0")} ${MONTH_NAMES_LONG_FR[jul.month - 1]} ${formatYear(jul.year)} (calendrier julien)`;
    }

    // ── Season & colors ───────────────────────────────────────────
    const season = ENOCH_MONTHS[en.monthIdx]?.season || "Printemps";
    const sc = SEASON_COLORS[season] || SEASON_COLORS.Printemps;
    const seasonColor = `rgb(${sc[0]},${sc[1]},${sc[2]})`;
    const seasonGlow = `rgba(${sc[0]},${sc[1]},${sc[2]},0.06)`;

    const moonPct = (moon.fraction * 100).toFixed(1);

    // Out-of-time day number
    const ootDayNum = en.curDay < 0 ? Math.abs(en.curDay) : en.curDay - ENOCH_OUT_OF_TIME_START + 1;

    // ── Build event HTML ──────────────────────────────────────────
    const allEvents: { group: string; items: { name: string; desc: string }[]; color: string }[] = [];

    // 1. Rest day
    if (restDay !== null) {
      allEvents.push({ group: "Jour de repos", items: [{ name: `${restDay}e jour de repos`, desc: "Sabbat hénochien" }], color: "rgba(56,189,248,0.85)" });
    }

    // 2. Biblical events
    if (biblicalEvts.length) {
      allEvents.push({ group: "Événements", items: biblicalEvts.map(e => ({ name: e.r, desc: e.t })), color: seasonColor });
    }

    // 3. Jewish feasts (Hebrew calendar)
    if (jewishEvtsHebrew.length) {
      allEvents.push({ group: "Fête Hébraïque", items: jewishEvtsHebrew.map(f => ({ name: f.n, desc: f.t })), color: "rgba(255,215,100,0.85)" });
    }

    // 4. Jewish feasts (Enoch calendar)
    if (jewishEvtsEnoch.length) {
      allEvents.push({ group: "Fête Hébraïque Hénoch", items: jewishEvtsEnoch.map(f => ({ name: f.n, desc: f.t })), color: `rgba(${sc[0]},${sc[1]},${sc[2]},0.75)` });
    }

    // 5. Christian feasts
    if (christianEvts.length) {
      allEvents.push({ group: "Fêtes Chrétiennes", items: christianEvts.map(f => ({ name: f.n, desc: f.t })), color: "rgba(167,139,250,0.85)" });
    }

    // 6. Islamic feasts
    if (islamicEvts.length) {
      allEvents.push({ group: "Fêtes Musulmanes", items: islamicEvts.map(f => ({ name: f.n, desc: f.t })), color: "rgba(52,211,153,0.85)" });
    }

    const hasEvents = allEvents.length > 0;
    const eventsHtml = allEvents.map(e => renderGroupedEvents(e.group, e.items, e.color)).join("");

    // ── Build HTML ─────────────────────────────────────────────────
    const hemLabel = hem === "S" ? "Sud" : "Nord";
    const monthName = MONTH_NAMES_LONG_FR[month - 1] || "";
    const yearStr = formatYear(year!);
    const gregorianDate = `${String(day).padStart(2, "0")} ${monthName} ${yearStr}`;

    const markup = `<div style="display:flex;flex-direction:column;width:100%;height:100%;color:#f1f5f9;font-family:'DM Mono',monospace;padding:44px;box-sizing:border-box;overflow:hidden;background:linear-gradient(145deg,#04080f 0%,#0a1220 40%,#0f172a 100%);"><div style="display:flex;flex-direction:column;width:100%;height:100%;background:radial-gradient(ellipse at 70% 50%,${seasonGlow} 0%,transparent 60%);"><div style="display:flex;flex:1;overflow:hidden;"><div style="display:flex;flex-direction:column;width:50%;padding-right:32px;"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;"><div style="display:flex;flex-direction:column;gap:2px;"><span style="font-size:22px;color:${seasonColor};font-weight:500;font-style:italic;font-family:'Cormorant Garamond',serif;text-shadow:0 0 20px rgba(${sc[0]},${sc[1]},${sc[2]},0.3);">Planisphère Céleste</span><span style="font-size:11px;color:${seasonColor};font-weight:500;text-transform:uppercase;letter-spacing:2px;">${hemLabel} · ${season}</span></div><div style="display:flex;align-items:center;gap:12px;">${renderMoonHtml(moon.phaseDeg, moon.fraction, hem === "N", 100)}<div style="display:flex;flex-direction:column;"><span style="font-size:19px;font-weight:500;color:#e2e8f0;"> ${tarenaDay.name}</span><span style="font-size:14px;color:rgba(170,185,205,0.75);">${moonPct}% · ${moon.name}</span></div></div></div><span style="font-size:40px;font-weight:800;color:rgba(248,250,252,0.97);line-height:1.1;margin-bottom:4px;">${dowGregorian} ${gregorianDate}</span>${julianDate ? `<span style="font-size:16px;color:rgba(148,163,184,0.7);margin-bottom:12px;">${julianDate}</span>` : ""}<div style="display:flex;flex-direction:column;background:rgba(255,255,255,0.03);border-radius:12px;padding:20px 22px;border:1px solid rgba(120,140,170,0.08);border-left:4px solid ${seasonColor};margin-top:14px;"><span style="font-size:12px;color:rgba(130,146,169,0.9);text-transform:uppercase;font-weight:700;letter-spacing:2px;">Calendrier d'Hénoch</span><span style="font-size:32px;font-weight:800;color:${seasonColor};margin-top:6px;">${en.outOfTime ? `Jour ${ootDayNum} hors du temps` : `Jour ${en.dayInMonth} — ${ENOCH_MONTHS[en.monthIdx].name}`}</span>${restDay !== null && !en.outOfTime ? `<span style="font-size:16px;color:rgba(56,189,248,0.85);margin-top:6px;text-shadow:0 0 10px rgba(56,189,248,0.3);">★ ${restDay}e jour de repos</span>` : ""}</div><div style="display:flex;flex-direction:column;background:rgba(255,255,255,0.03);border-radius:12px;padding:20px 22px;border:1px solid rgba(120,140,170,0.08);border-left:4px solid rgba(255,215,100,0.5);margin-top:8px;"><span style="font-size:12px;color:rgba(130,146,169,0.9);text-transform:uppercase;font-weight:700;letter-spacing:2px;">Calendrier Hébraïque</span><span style="font-size:28px;font-weight:800;color:rgba(255,215,100,0.85);margin-top:6px;">Jour ${hb.day} — ${hb.monthName}</span><span style="font-size:14px;color:rgba(180,195,220,0.7);margin-top:4px;">Mois de ${hb.monthLength} jours · An ${hb.hebrewYear}</span></div></div><div style="display:flex;flex-direction:column;width:50%;padding-left:32px;border-left:1px solid rgba(120,140,170,0.08);overflow:hidden;">${hasEvents ? eventsHtml : `<div style="display:flex;height:100%;align-items:center;justify-content:center;"><span style="font-size:16px;color:rgba(51,65,85,0.6);font-style:italic;font-family:'Cormorant Garamond',serif;">Aucun événement ce jour</span></div>`}</div></div><div style="display:flex;flex-direction:column;margin-top:auto;"><div style="display:flex;width:100%;height:1px;background:linear-gradient(90deg,${seasonColor},transparent);opacity:0.3;"></div></div></div></div>`;

    const svg = await satori(html(markup), {
      width: 1200,
      height: 630,
      fonts: [
        { name: "DM Mono", data: fontDM400, weight: 400, style: "normal" },
        { name: "DM Mono", data: fontDM500, weight: 500, style: "normal" },
        { name: "Cormorant Garamond", data: fontCG500i, weight: 500, style: "italic" },
      ],
    });

    // ── SVG → PNG ─────────────────────────────────────────────────
    const resvg = new Resvg(svg, {
      background: "rgba(0,0,0,0)",
      fitTo: { mode: "original" },
    });
    const pngData = resvg.render().asPng();
    const pngBuffer = Buffer.from(pngData);
    const base64 = pngBuffer.toString("base64");

    // ── Response ──────────────────────────────────────────────────
    const isToday = !dateStr;
    const cacheControl = isToday
      ? "public, max-age=3600, s-maxage=3600"
      : "public, max-age=31536000, s-maxage=31536000, immutable";

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": cacheControl,
        "Content-Length": pngBuffer.length.toString(),
      },
      body: base64,
      isBase64Encoded: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : "";
    console.error("OG function error:", msg, stack);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/plain" },
      body: `Erreur OG: ${msg}`,
    };
  }
};

export { handler };