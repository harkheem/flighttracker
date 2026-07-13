import { useEffect, useState } from 'react';

// Real destination photos via Wikipedia's public REST summary API — no API key required, and it's
// the airport/city's own Wikipedia page image, so it's an actual photo of the place rather than a
// generic stock image. Results are cached in-memory for the life of the app session.
const cache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

// The REST summary endpoint (api/rest_v1/page/summary) only ever returns a small ~320px preview
// thumbnail. The action API's pageimages module lets us ask for a real high-res size directly,
// and `redirects=1` follows Wikipedia redirects (e.g. a city nickname -> its canonical article).
async function fetchWikipediaThumbnail(city: string): Promise<string | null> {
  try {
    const url =
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(city)}` +
      `&prop=pageimages&format=json&pithumbsize=1200&redirects=1&origin=*`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        // Wikipedia's API etiquette asks for a descriptive User-Agent identifying the app.
        'User-Agent': 'FlightTracker/1.0 (personal single-user app; contact: n/a)',
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const pages = json?.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0] as { thumbnail?: { source?: string } } | undefined;
    return page?.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}

export function getDestinationImageUrl(city: string | null): Promise<string | null> {
  if (!city) return Promise.resolve(null);
  const key = city.trim().toLowerCase();
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null);
  if (inFlight.has(key)) return inFlight.get(key)!;

  const promise = fetchWikipediaThumbnail(city).then((url) => {
    cache.set(key, url);
    inFlight.delete(key);
    return url;
  });
  inFlight.set(key, promise);
  return promise;
}

export function useDestinationImage(city: string | null): string | null {
  const [url, setUrl] = useState<string | null>(city ? cache.get(city.trim().toLowerCase()) ?? null : null);

  useEffect(() => {
    let cancelled = false;
    setUrl(city ? cache.get(city.trim().toLowerCase()) ?? null : null);
    getDestinationImageUrl(city).then((result) => {
      if (!cancelled) setUrl(result);
    });
    return () => {
      cancelled = true;
    };
  }, [city]);

  return url;
}
