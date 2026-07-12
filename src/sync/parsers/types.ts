import type { FlightInput } from '../../types/flight';

export interface RawEmail {
  id: string; // Gmail message id -> becomes FlightInput.sourceRef
  subject: string;
  from: string;
  bodyText: string; // plain-text body (or text-extracted from HTML)
  bodyHtml: string | null;
  receivedAt: string; // ISO
}

export interface EmailParser {
  airlineCode: string;
  airlineName: string;
  // Gmail search query fragment used to narrow users.messages.list, e.g. "from:confirmation@delta.com"
  gmailQuery: string;
  // Returns true if this email looks like a confirmation/itinerary email this parser understands.
  matches(email: RawEmail): boolean;
  // Extracts zero or more flights (one email can contain a multi-segment itinerary).
  parse(email: RawEmail): FlightInput[];
}
