/**
 * cities.ts
 * Villes et sites remarquables affiches sur la carte,
 * ainsi que les sites de reference pour les alertes de transit.
 */

export interface City {
  name: string;
  lat: number;
  lon: number;
  type: 'city' | 'landmark';
  symbol?: string;
}

export interface Site {
  name: string;
  lat: number;
  lon: number;
}

export const CITIES: readonly City[] = [
  {name:'Paris',         lon:2.3522,     lat:48.8566,  type:'city'},
  {name:'Londres',       lon:-0.1276,    lat:51.5074,  type:'city'},
  {name:'New York',      lon:-74.0060,   lat:40.7128,  type:'city'},
  {name:'Los Angeles',   lon:-118.2437,  lat:34.0522,  type:'city'},
  {name:'São Paulo',     lon:-46.6333,   lat:-23.5505, type:'city'},
  {name:'Tokyo',         lon:139.6917,   lat:35.6895,  type:'city'},
  {name:'Pékin',         lon:116.4074,   lat:39.9042,  type:'city'},
  {name:'Mumbai',        lon:72.8777,    lat:19.0760,  type:'city'},
  {name:'Dubaï',         lon:55.2708,    lat:25.2048,  type:'city'},
  {name:'Sydney',        lon:151.2093,   lat:-33.8688, type:'city'},
  {name:'Lagos',         lon:3.3792,     lat:6.5244,   type:'city'},
  {name:'Mexico',        lon:-99.1332,   lat:19.4326,  type:'city'},
  {name:'Moscou',        lon:37.6173,    lat:55.7558,  type:'city'},
  {name:'Istanbul',      lon:28.9784,    lat:41.0082,  type:'city'},
  {name:'Buenos Aires',  lon:-58.3816,   lat:-34.6037, type:'city'},
  {name:'Nairobi',       lon:36.8219,    lat:-1.2921,  type:'city'},
  {name:'Singapour',     lon:103.8198,   lat:1.3521,   type:'city'},
  {name:'Séoul',         lon:126.9780,   lat:37.5665,  type:'city'},
  {name:'Chicago',       lon:-87.6298,   lat:41.8781,  type:'city'},
  {name:'Pyramide de Gizeh', lon:31.1343,lat:29.9792,  type:'landmark',symbol:'.'},
  {name:'Tahiti',        lon:-149.4068,  lat:-17.6509, type:'landmark',symbol:'✦'},
  {name:'Stonehenge',    lon:-1.8262,    lat:51.1789,  type:'landmark',symbol:'.'},
  {name:'Machu Picchu',  lon:-72.5450,   lat:-13.1631, type:'landmark',symbol:'.'},
  {name:'Angkor Wat',    lon:103.8670,   lat:13.4125,  type:'landmark',symbol:'.'},
  {name:'Teotihuacán',   lon:-98.8431,   lat:19.6925,  type:'landmark',symbol:'.'},
  {name:'Uluru',         lon:131.0369,   lat:-25.3444, type:'landmark',symbol:'✦'},
  {name:'Chichén Itzá',  lon:-88.5687,   lat:20.6843,  type:'landmark',symbol:'.'},
  {name:'Pôle Nord',     lon:0.0000,     lat:90.0000,  type:'landmark',symbol:'✦'},
  {name:'Pôle Sud',      lon:0.0000,     lat:-90.0000, type:'landmark',symbol:'✦'},
];

export const SITE_MAP: Readonly<Record<string, Site>> = {
  gizeh:      {name:'Pyramide de Gizeh', lon:31.1343,  lat:29.9792},
  stonehenge: {name:'Stonehenge',         lon:-1.8262,  lat:51.1789},
  machu:      {name:'Machu Picchu',       lon:-72.5450, lat:-13.1631},
  angkor:     {name:'Angkor Wat',         lon:103.8670, lat:13.4125},
  teotihuacan:{name:'Teotihuacán',        lon:-98.8431, lat:19.6925},
  paris:      {name:'Paris',              lon:2.3522,   lat:48.8566},
  london:     {name:'Londres',            lon:-0.1276,  lat:51.5074},
  newyork:    {name:'New York',           lon:-74.0060, lat:40.7128},
  sydney:     {name:'Sydney',             lon:151.2093, lat:-33.8688},
  uluru:      {name:'Uluru',              lon:131.0369, lat:-25.3444},
};
