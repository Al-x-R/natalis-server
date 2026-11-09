export interface Place {
  name: string;
  country: string;
  countryCode?: string;
  region?: string;
  lat: number;
  lon: number;
  timezone?: string;
  population?: number;
}

interface OpenMeteoResult {
  name: string;
  country?: string;
  country_code?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  population?: number;
}

const ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';

/** Free, keyless city search: https://open-meteo.com/en/docs/geocoding-api */
export async function geocode(query: string, opts: { language?: string; count?: number } = {}): Promise<Place[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set('name', query);
  url.searchParams.set('count', String(opts.count ?? 10));
  url.searchParams.set('language', opts.language ?? 'ru');
  url.searchParams.set('format', 'json');

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Open-Meteo geocoding responded ${res.status}`);
  const body = (await res.json()) as { results?: OpenMeteoResult[] };

  return (body.results ?? []).map((r) => ({
    name: r.name,
    country: r.country ?? '',
    countryCode: r.country_code,
    region: r.admin1,
    lat: r.latitude,
    lon: r.longitude,
    timezone: r.timezone,
    population: r.population,
  }));
}
