import { ensureValidAccessToken } from './gmailAuth';
import type { RawEmail } from '../parsers/types';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface GmailListResponse {
  messages?: { id: string }[];
  nextPageToken?: string;
}

interface GmailMessagePart {
  mimeType: string;
  body: { data?: string };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  internalDate: string;
  payload: {
    headers: { name: string; value: string }[];
    body: { data?: string };
    parts?: GmailMessagePart[];
    mimeType: string;
  };
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  // atob is available in the Hermes/JSC runtime via a polyfill included with Expo.
  const binary = atob(base64);
  try {
    return decodeURIComponent(
      binary
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
  } catch {
    return binary;
  }
}

function extractBody(payload: GmailMessage['payload']): { text: string; html: string | null } {
  let text = '';
  let html: string | null = null;

  function walk(part: GmailMessagePart | GmailMessage['payload']) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      text += decodeBase64Url(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      html = (html ?? '') + decodeBase64Url(part.body.data);
    }
    if ('parts' in part && part.parts) {
      part.parts.forEach(walk);
    }
  }
  walk(payload);
  return { text, html };
}

async function gmailFetch(path: string, accessToken: string): Promise<Response> {
  const res = await fetch(`${GMAIL_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Gmail API error ${res.status}: ${await res.text()}`);
  }
  return res;
}

// Searches Gmail for messages matching `query` (see EmailParser.gmailQuery) and returns them
// normalized as RawEmail. Capped at `maxResults` per call to keep background syncs bounded.
export async function searchGmailMessages(query: string, maxResults = 25): Promise<RawEmail[]> {
  const accessToken = await ensureValidAccessToken();

  const listRes = await gmailFetch(
    `/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
    accessToken
  );
  const list: GmailListResponse = await listRes.json();
  if (!list.messages?.length) return [];

  const emails: RawEmail[] = [];
  for (const { id } of list.messages) {
    const msgRes = await gmailFetch(`/messages/${id}?format=full`, accessToken);
    const message: GmailMessage = await msgRes.json();
    const headers = message.payload.headers ?? [];
    const subject = headers.find((h) => h.name === 'Subject')?.value ?? '';
    const from = headers.find((h) => h.name === 'From')?.value ?? '';
    const { text, html } = extractBody(message.payload);

    emails.push({
      id: message.id,
      subject,
      from,
      bodyText: text,
      bodyHtml: html,
      receivedAt: new Date(Number(message.internalDate)).toISOString(),
    });
  }
  return emails;
}
