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

export const MONTH_NAMES_FR: readonly string[] = ['', 'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'] as const;
export const MONTH_NAMES_LONG_FR: readonly string[] = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
] as const;

export const ENOCH_YEAR_DAYS: number = 364;
export const ENOCH_OUT_OF_TIME_START: number = 364;

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