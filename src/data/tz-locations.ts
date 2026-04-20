// Approximate geographic coordinates for common IANA timezones.
// Used to derive observer longitude/latitude when only a timezone is known.

export const TZ_LOCATION_MAP: Record<string, { lat: number; lng: number }> = {
  // UTC
  'UTC':                          { lat: 0,         lng: 0 },

  // Africa
  'Africa/Lagos':                 { lat: 6.5244,    lng: 3.3792 },
  'Africa/Cairo':                 { lat: 30.0444,   lng: 31.2357 },
  'Africa/Johannesburg':          { lat: -26.2041,  lng: 28.0473 },
  'Africa/Nairobi':               { lat: -1.2921,   lng: 36.8219 },

  // Europe
  'Atlantic/Azores':              { lat: 37.7412,   lng: -25.6756 },
  'Europe/London':                { lat: 51.5074,   lng: -0.1278 },
  'Europe/Paris':                 { lat: 48.8566,   lng: 2.3522 },
  'Europe/Athens':                { lat: 37.9838,   lng: 23.7275 },
  'Europe/Moscow':                { lat: 55.7558,   lng: 37.6173 },
  'Asia/Tbilisi':                 { lat: 41.7151,   lng: 44.8271 },

  // Atlantic Ocean / East Pacific
  'America/New_York':             { lat: 40.7128,   lng: -74.0060 },
  'America/Chicago':              { lat: 41.8781,   lng: -87.6298 },
  'America/Denver':               { lat: 39.7392,   lng: -104.9903 },
  'America/Los_Angeles':          { lat: 34.0522,   lng: -118.2437 },
  'America/Anchorage':            { lat: 61.2181,   lng: -149.9003 },
  'Pacific/Honolulu':             { lat: 21.3069,   lng: -157.8583 },

  // Central & South America
  'America/Lima':                 { lat: -12.0464,  lng: -77.0428 },
  'America/Caracas':              { lat: 10.4806,   lng: -66.8983 },
  'America/Sao_Paulo':            { lat: -23.5505,  lng: -46.6333 },
  'America/Argentina/Buenos_Aires': { lat: -34.6037, lng: -58.3816 },
  'America/St_Johns':             { lat: 47.5615,   lng: -52.7126 },
  'America/Halifax':              { lat: 44.6488,   lng: -63.5752 },
  'America/Toronto':              { lat: 43.6532,   lng: -79.3832 },
  'America/Mexico_City':          { lat: 19.4326,   lng: -99.1332 },

  // Asia / Middle East
  'Asia/Jerusalem':               { lat: 31.7683,   lng: 35.2137 },
  'Asia/Riyadh':                  { lat: 24.7136,   lng: 46.6753 },
  'Asia/Tehran':                  { lat: 35.6892,   lng: 51.3890 },
  'Asia/Dubai':                   { lat: 25.2048,   lng: 55.2708 },
  'Asia/Karachi':                 { lat: 24.8607,   lng: 67.0011 },
  'Asia/Kolkata':                 { lat: 22.5726,   lng: 88.3639 },
  'Asia/Kathmandu':               { lat: 27.7172,   lng: 85.3240 },
  'Asia/Dhaka':                   { lat: 23.8103,   lng: 90.4125 },
  'Asia/Bangkok':                 { lat: 13.7563,   lng: 100.5018 },
  'Asia/Singapore':               { lat: 1.3521,    lng: 103.8198 },
  'Asia/Hong_Kong':               { lat: 22.3193,   lng: 114.1694 },
  'Asia/Tokyo':                   { lat: 35.6895,   lng: 139.6917 },

  // Oceania
  'Australia/Adelaide':           { lat: -34.9285,  lng: 138.6007 },
  'Australia/Sydney':             { lat: -33.8688,  lng: 151.2093 },
  'Pacific/Auckland':             { lat: -36.8485,  lng: 174.7633 },
  'Pacific/Apia':                 { lat: -13.8333,  lng: -171.7667 },

  // French Polynesia
  'Pacific/Tahiti':               { lat: -17.5333,  lng: -149.5667 },
  'Pacific/Marquesas':            { lat: -8.9167,   lng: -140.1000 },
  'Pacific/Gambier':              { lat: -23.1167,  lng: -134.9667 },
};