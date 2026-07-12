// Tier 1 fallback: when an email parser can only extract a PNR/confirmation code (not full
// itinerary detail), call the airline's public "manage my booking" lookup to fill gaps.
//
// TODO: None of the four prioritized airlines (Delta, United, American, Southwest) expose a
// public JSON API for this — their "manage trip" pages are server-rendered and typically require
// solving a captcha or session cookie dance that changes without notice. Implementing this for
// real requires per-airline reverse engineering against a live confirmation code and should be
// tested against actual bookings before relying on it. Until then this is a documented no-op so
// refreshFlight() has a stable call site to build against.
export async function lookupByConfirmationCode(
  airlineCode: string,
  confirmationCode: string,
  flightNumber: string
): Promise<void> {
  switch (airlineCode) {
    case 'DL': // Delta — TODO: no public lookup API; would need site-specific reverse engineering
    case 'UA': // United — TODO: same
    case 'AA': // American — TODO: same
    case 'WN': // Southwest — TODO: same
    default:
      return;
  }
}
