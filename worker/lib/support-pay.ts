import { SupportPayPayload } from './types';

export const MAX_LABEL_LENGTH = 100;
export const MAX_PHONE_LENGTH = 30;
export const MAX_IPA_LENGTH = 100;
export const MAX_NAME_LENGTH = 100;
export const MAX_URL_LENGTH = 500;
export const MAX_NOTE_LENGTH = 2000;
export const MAX_UPDATED_AT_LENGTH = 50;

/**
 * Produces a deterministic canonical JSON string with object keys sorted alphabetically.
 */
export function canonicalJson(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalJson(item)).join(',')}]`;
  }

  const sortedKeys = Object.keys(obj).sort();
  const entries: string[] = [];
  for (const key of sortedKeys) {
    const val = obj[key];
    if (val !== undefined) {
      entries.push(`${JSON.stringify(key)}:${canonicalJson(val)}`);
    }
  }
  return `{${entries.join(',')}}`;
}

/**
 * Validates an HTTPS-only URL string.
 */
export function isValidHttpsUrl(urlString: string): boolean {
  if (!urlString || typeof urlString !== 'string') return false;
  if (urlString.length > MAX_URL_LENGTH) return false;
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates and sanitizes a SupportPayPayload or admin input.
 * Does NOT supply any default payment values.
 */
export function validateSupportPayPayload(input: any): {
  valid: boolean;
  error?: string;
  payload?: SupportPayPayload;
} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, error: 'Payload must be a non-null object' };
  }

  const v = typeof input.v === 'number' && Number.isInteger(input.v) && input.v > 0 ? input.v : 1;

  let updatedAt = '';
  if (typeof input.updatedAt === 'string') {
    const trimmed = input.updatedAt.trim();
    if (trimmed.length > MAX_UPDATED_AT_LENGTH || isNaN(Date.parse(trimmed))) {
      return { valid: false, error: 'Invalid updatedAt timestamp' };
    }
    updatedAt = trimmed;
  } else {
    updatedAt = new Date().toISOString();
  }

  // Validate instapay
  const instapayInput = input.instapay;
  const instapay: SupportPayPayload['instapay'] = {};
  if (instapayInput !== undefined) {
    if (typeof instapayInput !== 'object' || instapayInput === null || Array.isArray(instapayInput)) {
      return { valid: false, error: 'instapay must be an object' };
    }

    if (instapayInput.label !== undefined) {
      if (typeof instapayInput.label !== 'string' || instapayInput.label.length > MAX_LABEL_LENGTH) {
        return { valid: false, error: `instapay.label must be a string up to ${MAX_LABEL_LENGTH} chars` };
      }
      instapay.label = instapayInput.label.trim();
    }

    if (instapayInput.phone !== undefined) {
      if (typeof instapayInput.phone !== 'string' || instapayInput.phone.length > MAX_PHONE_LENGTH) {
        return { valid: false, error: `instapay.phone must be a string up to ${MAX_PHONE_LENGTH} chars` };
      }
      instapay.phone = instapayInput.phone.trim();
    }

    if (instapayInput.ipa !== undefined) {
      if (typeof instapayInput.ipa !== 'string' || instapayInput.ipa.length > MAX_IPA_LENGTH) {
        return { valid: false, error: `instapay.ipa must be a string up to ${MAX_IPA_LENGTH} chars` };
      }
      instapay.ipa = instapayInput.ipa.trim();
    }

    if (instapayInput.name !== undefined) {
      if (typeof instapayInput.name !== 'string' || instapayInput.name.length > MAX_NAME_LENGTH) {
        return { valid: false, error: `instapay.name must be a string up to ${MAX_NAME_LENGTH} chars` };
      }
      instapay.name = instapayInput.name.trim();
    }

    if (instapayInput.url !== undefined && String(instapayInput.url).trim().length > 0) {
      const urlStr = String(instapayInput.url).trim();
      if (!isValidHttpsUrl(urlStr)) {
        return { valid: false, error: 'instapay.url must be a valid HTTPS-only URL' };
      }
      instapay.url = urlStr;
    }
  }

  // Validate vodafoneCash
  const vodafoneCashInput = input.vodafoneCash;
  const vodafoneCash: SupportPayPayload['vodafoneCash'] = {};
  if (vodafoneCashInput !== undefined) {
    if (typeof vodafoneCashInput !== 'object' || vodafoneCashInput === null || Array.isArray(vodafoneCashInput)) {
      return { valid: false, error: 'vodafoneCash must be an object' };
    }

    if (vodafoneCashInput.label !== undefined) {
      if (typeof vodafoneCashInput.label !== 'string' || vodafoneCashInput.label.length > MAX_LABEL_LENGTH) {
        return { valid: false, error: `vodafoneCash.label must be a string up to ${MAX_LABEL_LENGTH} chars` };
      }
      vodafoneCash.label = vodafoneCashInput.label.trim();
    }

    if (vodafoneCashInput.phone !== undefined) {
      if (typeof vodafoneCashInput.phone !== 'string' || vodafoneCashInput.phone.length > MAX_PHONE_LENGTH) {
        return { valid: false, error: `vodafoneCash.phone must be a string up to ${MAX_PHONE_LENGTH} chars` };
      }
      vodafoneCash.phone = vodafoneCashInput.phone.trim();
    }

    if (vodafoneCashInput.name !== undefined) {
      if (typeof vodafoneCashInput.name !== 'string' || vodafoneCashInput.name.length > MAX_NAME_LENGTH) {
        return { valid: false, error: `vodafoneCash.name must be a string up to ${MAX_NAME_LENGTH} chars` };
      }
      vodafoneCash.name = vodafoneCashInput.name.trim();
    }
  }

  // Validate note
  let note: string | undefined = undefined;
  if (input.note !== undefined) {
    if (typeof input.note !== 'string' || input.note.length > MAX_NOTE_LENGTH) {
      return { valid: false, error: `note must be a string up to ${MAX_NOTE_LENGTH} chars` };
    }
    note = input.note.trim();
  }

  const payload: SupportPayPayload = {
    v,
    updatedAt,
    instapay,
    vodafoneCash,
    ...(note ? { note } : {}),
  };

  return { valid: true, payload };
}

/**
 * Computes an HMAC-SHA256 signature for a SupportPayPayload using the canonical JSON representation.
 */
export async function signSupportPayPayload(
  payload: SupportPayPayload,
  secretKey: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const canonicalString = canonicalJson(payload);
  const messageData = encoder.encode(canonicalString);
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);

  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
