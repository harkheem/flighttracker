import type { EmailParser, RawEmail } from './types';

// TODO(real-world-testing): Stub parsers for the remaining prioritized airlines (United,
// American, Southwest). Each needs the same treatment as delta.ts — a real confirmation email
// from this user's Gmail to reverse-engineer subject lines and body structure against. Wired into
// the registry now (see index.ts) so Settings shows them as "connected, not yet parsing" rather
// than silently missing.
function unimplemented(airlineCode: string, airlineName: string, domain: string): EmailParser {
  return {
    airlineCode,
    airlineName,
    gmailQuery: `from:(${domain}) subject:(confirmation OR itinerary)`,
    matches(_email: RawEmail): boolean {
      return false;
    },
    parse(_email: RawEmail) {
      return [];
    },
  };
}

export const unitedParser = unimplemented('UA', 'United Airlines', 'united.com');
export const americanParser = unimplemented('AA', 'American Airlines', 'aa.com');
export const southwestParser = unimplemented('WN', 'Southwest Airlines', 'southwest.com');
