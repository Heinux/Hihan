/**
 * Les 12 constellations zodiacales avec coordonnees J2000 (RA en heures, Dec en degres)
 * et liens entre etoiles pour le trace des asterismes.
 */

interface ConstellationStar {
  n: string;
  ra: number;
  dec: number;
}

export interface ZodiacConstellation {
  name: string;
  stars: ConstellationStar[];
  links: [number, number][];
  maxLink?: number;
}

export const ZODIAC_CONSTELLATIONS: readonly ZodiacConstellation[] = [
  { name: 'Bélier', stars: [
    { n: 'Hamal',     ra: 2.1198, dec: 23.4624 },
    { n: 'Sheratan',  ra: 1.9108, dec: 20.8081 },
    { n: 'Mesarthim', ra: 1.8897, dec: 19.2942 },
    { n: 'Botein',    ra: 3.1883, dec: 19.7273 },
  ], links: [[2, 1], [1, 0], [0, 3]] },

  { name: 'Taureau', stars: [
    { n: 'Aldébaran', ra: 4.5987, dec: 16.5092 },
    { n: 'Elnath',    ra: 5.4382, dec: 28.6079 },
    { n: 'Alcyone',   ra: 3.7913, dec: 24.1050 },
    { n: 'Alheka',    ra: 5.6273, dec: 21.1425 },
    { n: 'Ain',       ra: 4.4769, dec: 19.1803 },
    { n: 'Hyadum I',  ra: 4.3228, dec: 15.6276 },
    { n: 'Theta Tau', ra: 4.4765, dec: 15.9621 },
    { n: 'Prima Hya', ra: 4.2797, dec: 15.6276 },
  ], links: [
    [5, 7], [7, 6], [6, 4], [4, 0],
    [0, 1], [1, 3],
    [5, 2],
  ] },

  { name: 'Gémeaux', stars: [
    { n: 'Castor',    ra: 7.5767, dec: 31.8883 },
    { n: 'Pollux',    ra: 7.7553, dec: 28.0262 },
    { n: 'Alhena',    ra: 6.6286, dec: 16.3993 },
    { n: 'Wasat',     ra: 7.3353, dec: 21.9823 },
    { n: 'Mebsuda',   ra: 6.7322, dec: 25.1312 },
    { n: 'Mekbuda',   ra: 7.0685, dec: 20.5703 },
    { n: 'Tejat',     ra: 6.3826, dec: 22.5137 },
    { n: 'Propus',    ra: 6.2480, dec: 22.5068 },
    { n: 'Alzirr',    ra: 6.7548, dec: 12.8956 },
  ], links: [
    [0, 4], [4, 7], [7, 6],
    [1, 3], [3, 5], [5, 8],
    [0, 1],
    [4, 3],
  ] },

  { name: 'Cancer', stars: [
    { n: 'Al Tarf',    ra: 8.2753, dec: 9.1854 },
    { n: 'Acubens',    ra: 8.9745, dec: 11.8577 },
    { n: 'Asellus B.', ra: 8.7448, dec: 21.4658 },
    { n: 'Asellus A.', ra: 8.7215, dec: 18.1541 },
    { n: 'Iota Cnc',   ra: 8.7787, dec: 28.7600 },
  ], links: [
    [0, 3], [3, 2], [2, 4],
    [3, 1],
  ] },

  { name: 'Lion', stars: [
    { n: 'Régulus',    ra: 10.1395, dec: 11.9672 },
    { n: 'Denébola',   ra: 11.8177, dec: 14.5720 },
    { n: 'Algieba',    ra: 10.3328, dec: 19.8419 },
    { n: 'Delta Leo',  ra: 11.2353, dec: 20.5238 },
    { n: 'Chertan',    ra: 11.2371, dec: 15.4296 },
    { n: 'Adhafera',   ra: 10.2781, dec: 23.4174 },
    { n: 'Ras Elased', ra: 9.7641, dec: 23.7743 },
    { n: 'Rasalas',    ra: 9.8793, dec: 26.0069 },
    { n: 'Eta Leo',    ra: 10.1220, dec: 16.7625 },
  ], links: [
    [6, 7], [7, 5], [5, 2], [2, 8], [8, 0],
    [0, 4], [4, 3], [3, 1],
    [2, 3],
  ] },

  { name: 'Vierge', stars: [
    { n: 'Spica',        ra: 13.4199, dec: -11.1613 },
    { n: 'Porrima',      ra: 12.6942, dec: -1.4494 },
    { n: 'Auva',         ra: 12.9271, dec: 3.3975 },
    { n: 'Heze',         ra: 13.0363, dec: 0.5958 },
    { n: 'Vindemiatrix', ra: 13.0363, dec: 10.9592 },
    { n: 'Zaniah',       ra: 12.3319, dec: -0.6667 },
    { n: 'Zavijava',     ra: 11.8447, dec: 1.7649 },
    { n: 'Nu Vir',       ra: 11.7683, dec: 6.5294 },
    { n: 'Syrma',        ra: 14.2697, dec: -6.0008 },
    { n: 'Mu Vir',       ra: 14.7167, dec: -5.6578 },
    { n: '109 Vir',      ra: 14.7708, dec: 1.8929 },
  ], links: [
    [0, 3], [3, 1], [1, 5], [1, 2], [2, 4],
    [5, 6], [6, 7],
    [3, 8], [8, 9], [8, 10],
  ] },

  { name: 'Balance', stars: [
    { n: 'Zuben Esc.', ra: 14.8480, dec: -16.0416 },
    { n: 'Zuben Elg.', ra: 15.2835, dec: -9.3829 },
    { n: 'Brachium',   ra: 15.0671, dec: -25.2819 },
    { n: 'Zuben El.',  ra: 15.6357, dec: -28.1350 },
  ], links: [[0, 1], [0, 2], [2, 3], [1, 3]] },

  { name: 'Scorpion', stars: [
    { n: 'Antares',    ra: 16.4901, dec: -26.4320 },
    { n: 'Graffias',   ra: 16.0913, dec: -19.8057 },
    { n: 'Dschubba',   ra: 16.0053, dec: -22.6217 },
    { n: 'Alniyat σ',  ra: 16.3527, dec: -25.5928 },
    { n: 'Alniyat τ',  ra: 16.5993, dec: -28.2160 },
    { n: 'Jabbah',     ra: 16.1997, dec: -19.4603 },
    { n: 'Fang',       ra: 16.1432, dec: -20.6695 },
    { n: 'Al Niyat',   ra: 16.4654, dec: -25.0594 },
    { n: 'Sargas',     ra: 17.6210, dec: -42.9978 },
    { n: 'Girtab',     ra: 17.7079, dec: -39.0300 },
    { n: 'Shaula',     ra: 17.5602, dec: -37.1038 },
    { n: 'Lesath',     ra: 17.5308, dec: -37.2968 },
    { n: 'Iclil',      ra: 15.9712, dec: -26.1143 },
  ], links: [
    [1, 5], [5, 6], [6, 2], [2, 12], [12, 3], [3, 0], [0, 7], [7, 4],
    [4, 8], [8, 9], [9, 10], [10, 11],
  ] },

  { name: 'Sagittaire', stars: [
    { n: 'Alnasl',     ra: 18.0964, dec: -30.4242 },
    { n: 'Kaus Med.',  ra: 18.3509, dec: -29.8281 },
    { n: 'Kaus Austr.', ra: 18.4029, dec: -34.3847 },
    { n: 'Ascella',    ra: 19.0437, dec: -29.8804 },
    { n: 'Nanto',      ra: 18.9609, dec: -26.9968 },
    { n: 'Kaus Bor.',  ra: 18.4637, dec: -25.4217 },
    { n: 'Nunki',      ra: 18.9211, dec: -26.2967 },
    { n: 'Hecatebolus', ra: 19.1153, dec: -27.6704 },
    { n: 'Albaldah',   ra: 19.1624, dec: -21.0236 },
  ], links: [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 1],
    [4, 6], [6, 7], [7, 3],
    [6, 8],
  ] },

  { name: 'Capricorne', stars: [
    { n: 'Algedi',     ra: 20.2941, dec: -12.5082 },
    { n: 'Dabih',      ra: 20.3504, dec: -14.7814 },
    { n: 'Nashira',    ra: 21.6681, dec: -16.6624 },
    { n: 'Deneb Alg.', ra: 21.7840, dec: -16.1271 },
    { n: 'Theta Cap',  ra: 21.0991, dec: -17.2327 },
    { n: 'Zeta Cap',   ra: 21.4440, dec: -22.4113 },
    { n: 'Omega Cap',  ra: 20.8638, dec: -26.9190 },
  ], links: [
    [0, 1],
    [0, 4], [1, 4], [4, 2], [2, 3],
    [4, 5], [5, 6], [5, 3],
  ] },

  { name: 'Verseau', stars: [
    { n: 'Sadalsuud',  ra: 21.5260, dec: -5.5713 },
    { n: 'Sadalmelik', ra: 22.0963, dec: -0.3199 },
    { n: 'Sadachbia',  ra: 22.3647, dec: -1.3875 },
    { n: 'Zeta Aqr',   ra: 22.4906, dec: -0.1199 },
    { n: 'Pi Aqr',     ra: 22.2763, dec: 1.3781 },
    { n: 'Eta Aqr',    ra: 22.5893, dec: -0.1199 },
    { n: 'Albali',     ra: 20.7940, dec: -9.4958 },
    { n: 'Ancha',      ra: 22.2808, dec: -7.7836 },
    { n: 'Skat',       ra: 22.9107, dec: -15.8208 },
    { n: 'Lambda Aqr', ra: 22.8772, dec: -7.5799 },
  ], links: [
    [6, 0], [0, 1],
    [1, 2], [2, 4], [2, 3], [3, 5],
    [0, 7], [7, 9], [9, 8],
  ] },

  { name: 'Poissons', maxLink: 0.45, stars: [
    { n: 'Gamma Psc',  ra: 23.2862, dec: 3.2822 },
    { n: 'Kappa Psc',  ra: 23.4513, dec: 1.2574 },
    { n: 'Lambda Psc', ra: 23.6247, dec: 1.7804 },
    { n: 'TX Psc',     ra: 23.4609, dec: 3.4839 },
    { n: 'Iota Psc',   ra: 23.6656, dec: 5.6263 },
    { n: 'Theta Psc',  ra: 23.4769, dec: 6.3795 },
    { n: 'Omega Psc',  ra: 23.9885, dec: 6.8630 },
    { n: 'Delta Psc',  ra: 0.8122,  dec: 7.5850 },
    { n: 'Epsilon Psc', ra: 1.0490, dec: 7.8900 },
    { n: 'Zeta Psc',   ra: 1.2296, dec: 7.5800 },
    { n: 'Mu Psc',     ra: 1.5031, dec: 6.1437 },
    { n: 'Nu Psc',     ra: 1.6906, dec: 5.4876 },
    { n: 'Al Rischa',  ra: 2.0343, dec: 2.7637 },
    { n: 'Eta Psc',    ra: 1.5246, dec: 15.3457 },
    { n: 'Pi Psc',     ra: 1.6693, dec: 11.1150 },
    { n: 'Omicron Psc', ra: 1.7568, dec: 9.1576 },
  ], links: [
    [0, 3], [3, 5], [5, 4], [4, 2], [2, 1], [1, 0],
    [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 12],
    [4, 6],
    [13, 14], [14, 15], [15, 12],
  ] },
];
