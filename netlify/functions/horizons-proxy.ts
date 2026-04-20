import type { Handler } from '@netlify/functions';

// ── CORS headers ──────────────────────────────────────────────────
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

// ── Handler ────────────────────────────────────────────────────────
const handler: Handler = async (event) => {
  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const params = event.queryStringParameters || {};
  const endpoint = params.endpoint;

  if (!endpoint) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing "endpoint" parameter. Use "cad" or "eph".' }),
    };
  }

  // ── CAD: Close Approach Data (ssd-api.jpl.nasa.gov) ──
  if (endpoint === 'cad') {
    try {
      const url = new URL('https://ssd-api.jpl.nasa.gov/cad.api');
      if (params['date-min']) url.searchParams.set('date-min', params['date-min']);
      if (params['date-max']) url.searchParams.set('date-max', params['date-max']);
      if (params['dist-max']) url.searchParams.set('dist-max', params['dist-max']);
      url.searchParams.set('body', 'Earth');
      url.searchParams.set('limit', '20');

      const res = await fetch(url.toString(), {
        headers: { 'User-Agent': 'Hihan-Celestial-Map/1.0' },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return {
          statusCode: res.status,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `CAD API returned ${res.status}: ${text.slice(0, 200)}` }),
        };
      }

      const data = await res.json();
      return {
        statusCode: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
        },
        body: JSON.stringify(data),
      };
    } catch (err) {
      return {
        statusCode: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `CAD fetch failed: ${(err as Error).message}` }),
      };
    }
  }

  // ── EPH: Horizons Ephemeris (ssd.jpl.nasa.gov) ──
  if (endpoint === 'eph') {
    const des = params.des;
    if (!des) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing "des" parameter for ephemeris query.' }),
      };
    }

    try {
      const url = new URL('https://ssd.jpl.nasa.gov/api/horizons.api');
      url.searchParams.set('format', 'json');
      url.searchParams.set('COMMAND', `'DES=${des};'`);
      url.searchParams.set('OBJ_DATA', 'NO');
      url.searchParams.set('MAKE_EPHEM', 'YES');
      url.searchParams.set('EPHEM_TYPE', 'OBSERVER');
      url.searchParams.set('CENTER', '500@399');
      url.searchParams.set('QUANTITIES', '1');
      url.searchParams.set('ANG_FORMAT', 'DEG');
      if (params.start) url.searchParams.set('START_TIME', params.start);
      if (params.stop) url.searchParams.set('STOP_TIME', params.stop);
      if (params.step) url.searchParams.set('STEP_SIZE', params.step);

      const res = await fetch(url.toString(), {
        headers: { 'User-Agent': 'Hihan-Celestial-Map/1.0' },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return {
          statusCode: res.status,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `Horizons returned ${res.status}: ${text.slice(0, 200)}` }),
        };
      }

      const contentType = res.headers.get('content-type') || '';
      let body: string;
      if (contentType.includes('application/json')) {
        const data = await res.json();
        body = JSON.stringify(data);
      } else {
        body = await res.text();
      }

      return {
        statusCode: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': contentType.includes('json') ? 'application/json' : 'text/plain',
          'Cache-Control': 'public, max-age=300',
        },
        body,
      };
    } catch (err) {
      return {
        statusCode: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Horizons fetch failed: ${(err as Error).message}` }),
      };
    }
  }

  return {
    statusCode: 400,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: `Unknown endpoint: ${endpoint}. Use "cad" or "eph".` }),
  };
};

export { handler };