/**
 * nav-stars.ts
 * Etoiles de navigation (57 etoiles officielles + Pleiades).
 * Coordonnees J2000 : RA en heures, Dec en degres.
 * Mouvement propre en mas/an (Hipparcos).
 */

export interface NavStar {
  n: string;
  ra: number;
  dec: number;
  pm_ra: number;
  pm_dec: number;
  mag: number;
  nav: boolean;
  pleiades?: boolean;
}

export const NAV_STARS: readonly NavStar[] = [
  // Pleiades (cluster, shown as group)
  { n:'Alcyone',    ra:3.7913,  dec:24.1050,  pm_ra:19.97,  pm_dec:-44.78,  mag:2.87, nav:true,  pleiades:true },
  { n:'Atlas',      ra:3.8192,  dec:24.0525,  pm_ra:19.05,  pm_dec:-42.90,  mag:3.63, nav:false, pleiades:true },
  { n:'Electra',    ra:3.7441,  dec:24.1133,  pm_ra:20.67,  pm_dec:-46.45,  mag:3.72, nav:false, pleiades:true },
  { n:'Maia',       ra:3.7735,  dec:24.3678,  pm_ra:19.56,  pm_dec:-45.10,  mag:3.88, nav:false, pleiades:true },
  { n:'Merope',     ra:3.7616,  dec:23.9483,  pm_ra:12.56,  pm_dec:-48.48,  mag:4.18, nav:false, pleiades:true },
  { n:'Taygeta',    ra:3.7526,  dec:24.4672,  pm_ra:20.02,  pm_dec:-45.56,  mag:4.30, nav:false, pleiades:true },
  { n:'Pleione',    ra:3.8192,  dec:24.1367,  pm_ra:18.66,  pm_dec:-45.10,  mag:5.05, nav:false, pleiades:true },

  // 57 official navigation stars + major human navigation stars
  // pm_ra = μα* (mas/yr), pm_dec = μδ (mas/yr) — Hipparcos data
  { n:'Sirius',     ra:6.7525,  dec:-16.7161, pm_ra:-546.01, pm_dec:-1223.07, mag:-1.46, nav:true },
  { n:'Canopus',    ra:6.3992,  dec:-52.6957, pm_ra:19.99,   pm_dec:23.67,    mag:-0.74, nav:true },
  { n:'Arcturus',   ra:14.2612, dec:19.1822,  pm_ra:-1093.45,pm_dec:-1999.40, mag:-0.05, nav:true },
  { n:'Vega',       ra:18.6157, dec:38.7836,  pm_ra:200.94,  pm_dec:286.23,   mag:0.03,  nav:true },
  { n:'Capella',    ra:5.2781,  dec:45.9980,  pm_ra:75.52,   pm_dec:-427.13,  mag:0.08,  nav:true },
  { n:'Rigel',      ra:5.2423,  dec:-8.2017,  pm_ra:1.31,    pm_dec:-0.50,    mag:0.13,  nav:true },
  { n:'Procyon',    ra:7.6550,  dec:5.2250,   pm_ra:-495.30, pm_dec:-102.70,  mag:0.34,  nav:true },
  { n:'Achernar',   ra:1.6286,  dec:-57.2367, pm_ra:87.00,   pm_dec:-38.24,   mag:0.46,  nav:true },
  { n:'Betelgeuse', ra:5.9194,  dec:7.4069,   pm_ra:27.54,   pm_dec:11.30,    mag:0.50,  nav:true },
  { n:'Hadar',      ra:14.0637, dec:-60.3731, pm_ra:-33.27,  pm_dec:-24.21,   mag:0.61,  nav:true },
  { n:'Altair',     ra:19.8464, dec:8.8683,   pm_ra:536.23,  pm_dec:385.29,   mag:0.77,  nav:true },
  { n:'Aldébaran',  ra:4.5987,  dec:16.5092,  pm_ra:62.78,   pm_dec:-189.36,  mag:0.87,  nav:true },
  { n:'Spica',      ra:13.4199, dec:-11.1613, pm_ra:-42.50,  pm_dec:-31.73,   mag:0.98,  nav:true },
  { n:'Antares',    ra:16.4901, dec:-26.4320, pm_ra:-12.11,  pm_dec:-23.32,   mag:1.09,  nav:true },
  { n:'Pollux',     ra:7.7553,  dec:28.0262,  pm_ra:-626.55, pm_dec:-45.89,   mag:1.16,  nav:true },
  { n:'Fomalhaut',  ra:22.9608, dec:-29.6222, pm_ra:328.95,  pm_dec:-164.67,  mag:1.17,  nav:true },
  { n:'Deneb',      ra:20.6905, dec:45.2803,  pm_ra:2.01,    pm_dec:1.85,     mag:1.25,  nav:true },
  { n:'Mimosa',     ra:12.7953, dec:-59.6888, pm_ra:-48.69,  pm_dec:-13.52,   mag:1.25,  nav:true },
  { n:'Régulus',    ra:10.1395, dec:11.9672,  pm_ra:-248.73, pm_dec:5.59,     mag:1.36,  nav:true },
  { n:'Acrux',      ra:12.4434, dec:-63.0990, pm_ra:-35.26,  pm_dec:-14.49,   mag:1.40,  nav:true },
  { n:'Adhara',     ra:6.9771,  dec:-28.9722, pm_ra:2.49,    pm_dec:2.26,     mag:1.50,  nav:true },
  { n:'Shaula',     ra:17.5602, dec:-37.1038, pm_ra:-6.76,   pm_dec:-32.14,   mag:1.62,  nav:true },
  { n:'Castor',     ra:7.5767,  dec:31.8883,  pm_ra:-191.45, pm_dec:-145.19,  mag:1.58,  nav:true },
  { n:'Gacrux',     ra:12.5194, dec:-57.1133, pm_ra:26.62,   pm_dec:-266.41,  mag:1.59,  nav:true },
  { n:'Bellatrix',  ra:5.4186,  dec:6.3497,   pm_ra:-8.75,   pm_dec:-12.88,   mag:1.64,  nav:true },
  { n:'Elnath',     ra:5.4382,  dec:28.6079,  pm_ra:22.77,   pm_dec:-174.22,  mag:1.65,  nav:true },
  { n:'Alnilam',    ra:5.6036,  dec:-1.2019,  pm_ra:1.49,    pm_dec:-1.06,    mag:1.69,  nav:true },
  { n:'Al Nair',    ra:22.1372, dec:-46.9610, pm_ra:17.11,   pm_dec:-48.50,   mag:1.73,  nav:true },
  { n:'Alioth',     ra:12.9004, dec:55.9598,  pm_ra:110.67,  pm_dec:-8.15,    mag:1.76,  nav:true },
  { n:'Gamma Vel',  ra:8.1589,  dec:-47.3367, pm_ra:-5.93,   pm_dec:10.12,    mag:1.83,  nav:true },
  { n:'Mirfak',     ra:3.4054,  dec:49.8612,  pm_ra:23.87,   pm_dec:-25.30,   mag:1.79,  nav:true },
  { n:'Dubhe',      ra:11.0621, dec:61.7511,  pm_ra:-134.10, pm_dec:-34.70,   mag:1.81,  nav:true },
  { n:'Wezen',      ra:7.1397,  dec:-26.3933, pm_ra:-3.10,   pm_dec:3.29,     mag:1.83,  nav:true },
  { n:'Kaus Austr.',ra:18.4029, dec:-34.3847, pm_ra:-39.52,  pm_dec:-126.53,  mag:1.85,  nav:true },
  { n:'Avior',      ra:8.3752,  dec:-59.5094, pm_ra:-5.33,   pm_dec:9.41,     mag:1.86,  nav:true },
  { n:'Alkaid',     ra:13.7923, dec:49.3133,  pm_ra:-119.66, pm_dec:-14.91,   mag:1.85,  nav:true },
  { n:'Sargas',     ra:17.6210, dec:-42.9978, pm_ra:5.78,    pm_dec:0.46,     mag:1.87,  nav:true },
  { n:'Menkent',    ra:14.1114, dec:-36.3700, pm_ra:-520.19, pm_dec:-520.61,  mag:2.06,  nav:true },
  { n:'Atria',      ra:16.8111, dec:-69.0278, pm_ra:-16.16,  pm_dec:-33.58,   mag:1.91,  nav:true },
  { n:'Peacock',    ra:20.4274, dec:-56.7350, pm_ra:7.59,    pm_dec:-88.64,   mag:1.94,  nav:true },
  { n:'Polaris',    ra:2.5302,  dec:89.2641,  pm_ra:44.22,   pm_dec:-11.74,   mag:1.97,  nav:true },
  { n:'Mirzam',     ra:6.3783,  dec:-17.9558, pm_ra:-5.67,   pm_dec:-0.56,    mag:1.98,  nav:true },
  { n:'Alphard',    ra:9.4598,  dec:-8.6586,  pm_ra:-14.44,  pm_dec:33.19,    mag:1.99,  nav:true },
  { n:'Hamal',      ra:2.1198,  dec:23.4624,  pm_ra:188.55,  pm_dec:-148.08,  mag:2.00,  nav:true },
  { n:'Diphda',     ra:0.7264,  dec:-17.9869, pm_ra:232.55,  pm_dec:31.55,    mag:2.04,  nav:true },
  { n:'Nunki',      ra:18.9211, dec:-26.2967, pm_ra:14.33,   pm_dec:-53.95,   mag:2.05,  nav:true },
  { n:'Denébola',   ra:11.8177, dec:14.5720,  pm_ra:-497.68, pm_dec:-114.67,  mag:2.14,  nav:true },
  { n:'Menkar',     ra:3.0381,  dec:4.0897,   pm_ra:-7.34,   pm_dec:-36.62,   mag:2.54,  nav:true },
  { n:'Zuben Elg.', ra:15.2835, dec:-9.3829,  pm_ra:-104.76, pm_dec:-27.53,   mag:2.61,  nav:true },
  { n:'Markab',     ra:23.0794, dec:15.2053,  pm_ra:59.36,   pm_dec:-42.00,   mag:2.49,  nav:true },
  { n:'Suhail',     ra:9.1337,  dec:-43.4328, pm_ra:-24.50,  pm_dec:13.51,    mag:2.23,  nav:true },
  { n:'Schedar',    ra:0.6751,  dec:56.5372,  pm_ra:80.26,   pm_dec:-159.23,  mag:2.24,  nav:true },
  { n:'Eltanin',    ra:17.9435, dec:51.4889,  pm_ra:-16.24,  pm_dec:-22.80,   mag:2.24,  nav:true },
  { n:'Sabik',      ra:17.1730, dec:-15.7250, pm_ra:40.12,   pm_dec:96.44,    mag:2.43,  nav:true },
  { n:'Rasalhague', ra:17.5822, dec:12.5600,  pm_ra:107.47,  pm_dec:-242.57,  mag:2.08,  nav:true },
  { n:'Alphecca',   ra:15.5781, dec:26.7147,  pm_ra:119.29,  pm_dec:-89.58,   mag:2.23,  nav:true },
];
