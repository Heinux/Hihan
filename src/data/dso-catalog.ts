/**
 * dso-catalog.ts
 * Catalogue DSO (Deep Sky Objects) du Groupe Local :
 * satellites de la Voie Lactee, groupe d'Andromede, Triangulum, M83, naines proches.
 * Coordonnees J2000 : RA en heures decimales, Dec en degres decimaux.
 */

export interface DSOObject {
  name: string;
  ra: number;
  dec: number;
}

export interface DSOGroup {
  id: string;
  label: string;
  color: string;
  showPath: boolean;
  objects: DSOObject[];
}

export const DSO_GROUPS: readonly DSOGroup[] = [
  {
    id:'mw_satellites', label:'Satellites Voie Lactée', color:'#a8d8b0', showPath:false,
    objects:[
      {name:'Grand Nuage de Magellan',ra:5+23/60+34/3600,dec:-(69+45/60+24/3600)},
      {name:'Petit Nuage de Magellan',ra:0+52/60+44.8/3600,dec:-(72+49/60+43/3600)},
      {name:'Sagittarius dSph',ra:18+55/60+19.5/3600,dec:-(30+32/60+43/3600)},
      {name:'Fornax Dwarf',ra:2+39/60+59.3/3600,dec:-(34+26/60+57/3600)},
      {name:'Sculptor Dwarf',ra:1+0/60+9.3/3600,dec:-(33+42/60+33/3600)},
      {name:'Carina Dwarf',ra:6+41/60+36.7/3600,dec:-(50+57/60+58/3600)},
      {name:'Ursa Minor Dwarf',ra:15+9/60+8.5/3600,dec:67+13/60+21/3600},
      {name:'Draco Dwarf',ra:17+20/60+12.4/3600,dec:57+54/60+55/3600},
      {name:'Leo I',ra:10+8/60+27.4/3600,dec:12+18/60+27/3600},
      {name:'Leo II',ra:11+13/60+29.2/3600,dec:22+9/60+17/3600},
      {name:'Sextans Dwarf',ra:10+13/60+2.9/3600,dec:-(1+36/60+53/3600)},
      {name:'Ursa Major I Dwarf',ra:10+34/60+52.8/3600,dec:51+55/60+12/3600},
      {name:'Ursa Major II Dwarf',ra:8+51/60+30.0/3600,dec:63+7/60+48/3600},
      {name:'Triangulum II',ra:2+13/60+17.4/3600,dec:36+10/60+42.4/3600},
      {name:'Willman 1',ra:10+49/60+22.3/3600,dec:51+3/60+3.6/3600},
      {name:'Canes Venatici I',ra:13+28/60+3.5/3600,dec:33+33/60+21/3600},
      {name:'Canes Venatici II',ra:12+57/60+10.0/3600,dec:34+19/60+15/3600},
      {name:'Boötes I',ra:14+0/60+6.0/3600,dec:14+30/60+0/3600},
      {name:'Crater II',ra:11+49/60+14.4/3600,dec:-(18+24/60+46.8/3600)},
      {name:'Hercules Dwarf',ra:16+31/60+2.0/3600,dec:12+47/60+30/3600},
      {name:'Leo IV',ra:11+32/60+57.0/3600,dec:-(0+32/60+0/3600)},
      {name:'Leo V',ra:11+31/60+9.6/3600,dec:2+13/60+12/3600},
      {name:'Segue 1',ra:10+7/60+4.0/3600,dec:16+4/60+55/3600},
      {name:'Reticulum II',ra:3+35/60+42.14/3600,dec:-(54+2/60+57.1/3600)},
      {name:'UMa III / UNIONS 1',ra:11+38/60+49.8/3600,dec:31+4/60+42/3600},
      {name:'Aquarius III',ra:23+48/60+52.32/3600,dec:-(3+29/60+20.4/3600)},
      {name:'Leo K',ra:10+46/60+14.4/3600,dec:11+59/60+24/3600},
      {name:'Leo M',ra:10+34/60+28.8/3600,dec:14+19/60+48/3600},
      {name:'Sextans II',ra:10+11/60+43.2/3600,dec:-(1+27/60+36/3600)},
      {name:'Virgo III',ra:12+20/60+2.4/3600,dec:-(0+12/60+0/3600)},
    ]
  },
  {
    id:'andromeda', label:'Groupe Andromède (M31)', color:'#a0b8e0', showPath:false,
    objects:[
      {name:'M31 (Andromède)',ra:0+42/60+44.16/3600,dec:41+16/60+8.4/3600},
      {name:'M32',ra:0+42/60+41.76/3600,dec:40+51/60+54/3600},
      {name:'M110 (NGC 205)',ra:0+40/60+22.08/3600,dec:41+41/60+6/3600},
      {name:'NGC 147',ra:0+33/60+12/3600,dec:48+30/60+32.4/3600},
      {name:'NGC 185',ra:0+38/60+58.08/3600,dec:48+20/60+13.2/3600},
      {name:'Andromède I',ra:0+45/60+39.84/3600,dec:38+2/60+27.6/3600},
      {name:'Andromède II',ra:1+16/60+29.76/3600,dec:33+25/60+8.4/3600},
      {name:'Andromède III',ra:0+35/60+33.84/3600,dec:36+29/60+52.8/3600},
      {name:'Andromède V',ra:1+10/60+17.04/3600,dec:47+37/60+40.8/3600},
      {name:'Andromède VI (Pégase)',ra:23+51/60+46.3/3600,dec:24+34/60+57/3600},
      {name:'Andromède VII (Cassiopée)',ra:23+26/60+30.84/3600,dec:50+41/60+31.2/3600},
      {name:'Andromède IX',ra:0+52/60+53.04/3600,dec:43+11/60+56.4/3600},
      {name:'Andromède X',ra:1+6/60+34.8/3600,dec:44+48/60+14.4/3600},
      {name:'Andromède XI',ra:0+46/60+19.92/3600,dec:33+48/60+3.6/3600},
      {name:'Andromède XII',ra:0+47/60+27.12/3600,dec:34+22/60+30/3600},
      {name:'Andromède XIII',ra:0+51/60+51.12/3600,dec:33+0/60+14.4/3600},
      {name:'Andromède XIV',ra:0+41/60+35.04/3600,dec:29+14/60+42/3600},
      {name:'Andromède XV',ra:1+14/60+18.72/3600,dec:38+7/60+1.2/3600},
      {name:'Andromède XVI',ra:0+59/60+29.76/3600,dec:32+22/60+26.4/3600},
      {name:'Andromède XVII',ra:0+37/60+7.08/3600,dec:44+19/60+19.2/3600},
      {name:'Andromède XVIII',ra:0+2/60+14.16/3600,dec:45+5/60+20.4/3600},
      {name:'Andromède XIX',ra:0+19/60+32.16/3600,dec:35+2/60+38.4/3600},
      {name:'Andromède XX',ra:0+7/60+30.72/3600,dec:35+7/60+51.6/3600},
      {name:'Andromède XXI',ra:23+54/60+47.88/3600,dec:42+28/60+15.6/3600},
      {name:'Andromède XXII',ra:1+27/60+40.08/3600,dec:28+5/60+24/3600},
      {name:'Andromède XXIII',ra:1+29/60+21.84/3600,dec:38+43/60+8.4/3600},
      {name:'Andromède XXIV',ra:0+37/60+27.12/3600,dec:46+29/60+38.4/3600},
      {name:'Andromède XXV',ra:0+30/60+8.88/3600,dec:46+51/60+7.2/3600},
      {name:'Andromède XXVI',ra:23+51/60+19.92/3600,dec:47+54/60+50.4/3600},
      {name:'Andromède XXVII',ra:0+37/60+27.12/3600,dec:45+23/60+13.2/3600},
      {name:'Andromède XXVIII',ra:0+41/60+36.96/3600,dec:36+42/60+14.4/3600},
      {name:'Andromède XXIX',ra:23+58/60+55.68/3600,dec:30+45/60+21.6/3600},
      {name:'Andromède XXX',ra:1+0/60+18/3600,dec:38+4/60+8.4/3600},
      {name:'Andromède XXXI (Lacerta I)',ra:22+49/60+49/3600,dec:41+16/60+37.2/3600},
      {name:'Andromède XXXII (CasIII)',ra:23+29/60+59/3600,dec:49+37/60+58.8/3600},
      {name:'Andromède XXXIII (Per I)',ra:2+10/60+9.1/3600,dec:41+51/60+10.8/3600},
      {name:'Andromède XXXIV (Peg V)',ra:23+18/60+27.89/3600,dec:33+21/60+35.61/3600},
      {name:'Pégase VII',ra:23+1/60+49.3/3600,dec:32+5/60+52/3600},
      {name:'Andromède XXXV',ra:0+26/60+38.60/3600,dec:40+6/60+29.3/3600},
    ]
  },
  {
    id:'triangulum', label:'Groupe Triangulum (M33)', color:'#d0b8e8', showPath:false,
    objects:[
      {name:'M33 (Triangulum)',ra:1+33/60+50.9/3600,dec:30+39/60+37/3600},
      {name:'Triangulum IV',ra:1+28/60+38.93/3600,dec:30+59/60+3.6/3600},
      {name:'Pisces VII',ra:1+21/60+40.6/3600,dec:26+23/60+28/3600},
      {name:'Pisces Dwarf (LGS 3)',ra:1+3/60+55/3600,dec:21+53/60+6/3600},
    ]
  },
  {
    id:'m83', label:'Groupe M83', color:'#e8c8a0', showPath:false,
    objects:[
      {name:'M83 (Pinwheel Sud)',ra:13+37/60+0.919/3600,dec:-(29+51/60+56.74/3600)},
      {name:'NGC 5264',ra:13+41/60+36.683/3600,dec:-(29+54/60+47.25/3600)},
      {name:'PGC 47885 (M83-dE1)',ra:13+40/60+18/3600,dec:-(30+7/60+3/3600)},
      {name:'PGC 48111 (M83-dE2)',ra:13+42/60+39.4/3600,dec:-(28+2/60+42/3600)},
      {name:'UGCA 365',ra:13+43/60+48/3600,dec:-(29+14/60+6/3600)},
      {name:'dw1341-29',ra:13+44/60+32.6/3600,dec:-(29+27/60+27/3600)},
      {name:'KK 208',ra:13+46/60+30/3600,dec:-(28+59/60+0/3600)},
    ]
  },
  {
    id:'nearby', label:'Naines & proches', color:'#c8d8b8', showPath:false,
    objects:[
      {name:'NGC 3109',ra:10+3/60+6.88/3600,dec:-(26+9/60+34.5/3600)},
      {name:'Sextans A (DDO 75)',ra:10+11/60+0.8/3600,dec:-(4+41/60+34.2/3600)},
      {name:'Sextans B (DDO 70)',ra:10+0/60+0.1/3600,dec:5+19/60+56/3600},
      {name:'Antlia Dwarf',ra:10+4/60+3.9/3600,dec:-(27+19/60+55/3600)},
      {name:'Leo P',ra:10+21/60+45.12/3600,dec:18+5/60+16.89/3600},
      {name:'IC 10',ra:0+20/60+17.29/3600,dec:59+18/60+13.87/3600},
      {name:'WLM (DDO 221)',ra:0+1/60+58.1/3600,dec:-(15+27/60+39/3600)},
      {name:'IC 1613 (DDO 8)',ra:1+4/60+47.8/3600,dec:2+7/60+4/3600},
      {name:'Phoenix Dwarf',ra:1+51/60+6.3/3600,dec:-(44+26/60+41/3600)},
      {name:'NGC 6822 (Barnard)',ra:19+44/60+57.7/3600,dec:-(14+48/60+12/3600)},
      {name:'Sagittarius dIrr',ra:19+29/60+59/3600,dec:-(17+40/60+41/3600)},
      {name:'Pegasus dIrr (DDO 216)',ra:23+28/60+36.2/3600,dec:14+44/60+35/3600},
      {name:'Aquarius Dwarf (DDO 210)',ra:20+46/60+51.8/3600,dec:-(12+50/60+53/3600)},
      {name:'Cetus Dwarf',ra:0+26/60+11/3600,dec:-(11+2/60+40/3600)},
      {name:'Tucana Dwarf',ra:22+41/60+49/3600,dec:-(64+25/60+12/3600)},
      {name:'IC 5152',ra:22+2/60+41.52/3600,dec:-(51+17/60+47.2/3600)},
    ]
  },
];
