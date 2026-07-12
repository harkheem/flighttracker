import type { Flight } from '../types/flight';

export function formatDateTime(isoLocal: string): { date: string; time: string } {
  const d = new Date(isoLocal);
  const date = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return { date, time };
}

export function isUpcoming(flight: Flight): boolean {
  return new Date(flight.departureTimeLocal).getTime() >= Date.now();
}

export function airlineInitials(airlineName: string): string {
  return airlineName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

const AIRLINE_COLORS: Record<string, string> = {
  DL: '#C01933',
  UA: '#005DAA',
  AA: '#0078D2',
  WN: '#304CB2',
};

export function airlineColor(airlineCode: string | null): string {
  if (airlineCode && AIRLINE_COLORS[airlineCode]) return AIRLINE_COLORS[airlineCode];
  return '#4B5563';
}
