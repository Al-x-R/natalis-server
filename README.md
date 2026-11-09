# Natalis server

Natal chart calculation API: Node.js + TypeScript + Fastify on Swiss Ephemeris.
`POST /chart` computes planets, houses, angles, and aspects from a birth date, time,
and place; `GET /geocode` searches cities; `GET /source` points to this repository.

All calculation code sits behind the `EphemerisEngine` interface (`src/astro/types.ts`).
Only `src/astro/swephEngine.ts` touches Swiss Ephemeris, so another data source can
replace it without changing routes, houses, or aspects.

## License

**This server is licensed under [AGPL-3.0-or-later](LICENSE).**
It has to be: it uses [Swiss Ephemeris](https://www.astro.com/swisseph/) through the
[`sweph`](https://www.npmjs.com/package/sweph) package, which Astrodienst AG offers
under the AGPL or a paid Professional License. The `.se1` data files are under the same terms.

What the AGPL asks of whoever runs the server for other people:

- The source of the code **actually deployed**, including local changes, must be public.
  Keep this repository in sync with production, or set `SOURCE_URL` to where your version lives.
- Users must be told where it is. The server answers `GET /source`, and the Natalis app
  links to this repository at the bottom of its form screen.

The Natalis mobile app is a separate program in a separate repository. It contains no
Swiss Ephemeris code and only calls this server over HTTP.
To close the server source instead, buy the professional license from Astrodienst.

Other data that needs credit or has terms of its own:

| What | Terms |
|---|---|
| Time zone boundaries in `geo-tz` | ODbL, © OpenStreetMap contributors (credited in the app) |
| City search, [Open-Meteo](https://open-meteo.com/en/terms) geocoding on GeoNames data | CC BY 4.0 (credited in the app). **The free API is for non-commercial use**; a commercial release needs their paid plan or another geocoder |
| `tzdata/pre1970.json`, from the IANA tz database | public domain |

## Running

Requirements: Node.js ≥ 20 (tested on 24).

```bash
npm install             # also downloads the ephemeris files (postinstall), see below
npm run dev             # http://localhost:3000, auto-reload
npm test                # vitest
npm run build && npm start
```

`sweph` ships prebuilt binaries for macOS arm64, Linux x64/arm64, and Windows x64.
On other platforms it compiles from source. npm ≥ 11 blocks install scripts by
default, so allow it with `npm install-scripts approve sweph` and reinstall.

## Ephemeris files

| Setup | Precision | Chiron |
|---|---|---|
| No files (Moshier fallback) | ~1″ for planets, a few ″ for the Moon | ❌ omitted, a warning is returned |
| `npm run ephe:download` (`sepl_18`, `semo_18`, `seas_18`, 1800–2400 AD, ~2 MB) | full Swiss Ephemeris | ✅ |

Files are searched in `$EPHE_PATH` if set, otherwise in `ephe/`.
`npm install` downloads any missing files automatically (a failed download only warns);
`npm run ephe:download` retries, `-- --force` re-downloads. The server logs a warning at
startup if a file is missing, and `npm test` fails without them: `test/chiron.test.ts`
checks Chiron against NASA JPL Horizons (≤1′).
The response field `ephemeris` reports `"swiss"` or `"moshier"`.

Environment variables: `PORT` (3000), `HOST` (0.0.0.0), `EPHE_PATH`, `SOURCE_URL` (see [License](#license)).

## Time zone handling

1. `geo-tz/all` maps lat/lon to an IANA zone. The `all` dataset keeps zones that were merged after 1970 (`Europe/Amsterdam`, `Atlantic/Reykjavik`, …).
2. The historical offset comes from two sources (`src/time/tzHistory.ts`):
   - **from 1970 on**: Luxon/ICU tzdata. For example, Kharkiv in May 1990 was on Moscow summer time (UTC+4).
   - **before 1970**: `tzdata/pre1970.json`, compiled from the IANA source *including `backzone`*. Node's ICU serves merged zones their neighbour's data (Amsterdam gets Brussels, Reykjavik gets Abidjan), which is wrong before 1970: Iceland was on UTC−1 until 1968, the Netherlands on +0:19:32 until 1937. Regenerate with `npm run tzdata:build` (needs `zic`, `tar`, and network); the file is committed.
3. **Nonexistent** local times (spring-forward gap) return `422 NONEXISTENT_LOCAL_TIME`.
4. **Ambiguous** local times (fall-back overlap) return `422 AMBIGUOUS_LOCAL_TIME`, listing both options. Resend with `"disambiguation": "earlier" | "later"`.
5. **Before a common civil time** (tzdata period `LMT`, e.g. Germany before 1893), tzdata only has the mean time of the zone's reference city (Berlin +0:53:28). The server uses the birthplace's own local mean time (`longitude × 4 min`) and sets `localMeanTime: true`.
   A *named* mean time is taken at face value, because it was the legal time of the whole country: Paris Mean Time in France 1891–1911, Dublin Mean Time in Ireland 1880–1916, and so on. The exception is the former Russian Empire, where every town kept its own time: the zones in `CITY_MEAN_TIME` (`src/time/localToUtc.ts`: Kyiv, Moscow, Minsk, Simferopol, Chisinau, Riga, Tallinn, Vilnius, Tbilisi) are treated like LMT for that period.
6. To override the zone lookup, pass `"timezone": "Europe/Kyiv"`, or a fixed offset with `"utcOffsetMinutes": 60` (the app's manual UTC offset field). tzdata follows one reference city per zone and is only guaranteed since 1970, so some places are still wrong: `Europe/Kyiv` gives Lviv in 1930 UTC+2, while it was on Polish time (UTC+1).
7. Dates are **Gregorian**. Old Style (Julian) dates, e.g. Russia before 1918, must be converted first. Years outside 1800–2399 (the range of the ephemeris files) return `422 DATE_OUT_OF_RANGE`.

## API examples

```bash
# Chart
curl -s -X POST localhost:3000/chart -H 'content-type: application/json' \
  -d '{"date":"1990-05-15","time":"14:30","lat":49.98,"lon":36.25,"houseSystem":"P"}'

# City search (Open-Meteo, free, no key)
curl -s 'localhost:3000/geocode?q=Kharkiv'
curl -s 'localhost:3000/geocode?q=Kharkiv&lang=en&count=3'

# Nonexistent time → 422 NONEXISTENT_LOCAL_TIME
curl -s -X POST localhost:3000/chart -H 'content-type: application/json' \
  -d '{"date":"2021-03-28","time":"03:30","lat":50.45,"lon":30.52}'

# Ambiguous time → 422 AMBIGUOUS_LOCAL_TIME; then pick one
curl -s -X POST localhost:3000/chart -H 'content-type: application/json' \
  -d '{"date":"2021-10-31","time":"03:30","lat":50.45,"lon":30.52,"disambiguation":"later"}'
```

Response shape (abridged):

```jsonc
{
  "timezone": "Europe/Kyiv",
  "utcOffsetMinutes": 240,
  "localTime": "1990-05-15T14:30:00.000+04:00",
  "utc": "1990-05-15T10:30:00.000Z",
  "localMeanTime": false,
  "planets": [{ "name": "Sun", "longitude": 54.336, "sign": "Taurus", "degreeInSign": 24.336, "house": 9, "retrograde": false, "latitude": 0, "speed": 0.96 }],
  "houses":  [{ "number": 1, "cusp": 163.236, "sign": "Virgo", "degreeInSign": 13.236 }],
  "angles":  { "asc": { "longitude": 163.236, "sign": "Virgo", "degreeInSign": 13.236 }, "mc": { } },
  "aspects": [{ "planet1": "Jupiter", "planet2": "Uranus", "type": "opposition", "orb": 0.34 }],
  "houseSystem": "P",
  "ephemeris": "swiss",
  "warnings": []
}
```

Aspect orbs: conjunction/opposition 8°, trine/square 7°, sextile 5°, plus 2° when
the Sun or Moon is involved (`src/astro/aspects.ts`). Planet houses are
assigned by ecliptic longitude between cusps.

## Tests and reference charts

`npm test` runs unit tests for time conversion (DST gaps and overlaps, Soviet-era
offsets, LMT, national mean times, pre-1970 zones), zodiac and house math, aspects,
and API smoke tests. `test/planets.test.ts` and `test/chiron.test.ts` compare
Sun–Pluto (≤5″) and Chiron (≤1′) with NASA JPL Horizons.

Reference charts live in `test/fixtures/reference-charts.json`: Einstein
(Ulm 1879, LMT), Kharkiv 1990, and Sydney 2000, with all planets, ASC, MC, and 12 cusps
taken from astro.com's [online Swiss Ephemeris](https://www.astro.com/swisseph/swetest.htm)
and compared at 0.5′. To add a chart from astro.com's chart page, use its notation
(`"23°30' Pisces"`) and settings (tropical, Placidus, **true** node); without a
per-chart `toleranceArcmin` the default 1.5′ applies.
