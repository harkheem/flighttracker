import type { EmailParser } from './types';
import { deltaParser } from './delta';
import { unitedParser, americanParser, southwestParser } from './unimplemented';

// Prioritized order matches the user's most-flown airlines (Delta, United, American, Southwest).
export const EMAIL_PARSERS: EmailParser[] = [deltaParser, unitedParser, americanParser, southwestParser];
