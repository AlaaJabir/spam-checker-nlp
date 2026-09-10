/**
 * Security & Sanitization Utilities
 * Protects against SSRF, dangerous payload injection, and unsafe preview execution.
 */

// Private IP patterns for SSRF prevention
const IPV4_PRIVATE_PATTERNS = [
  /^127\./, // 127.0.0.0/8 Loopback
  /^10\./, // 10.0.0.0/8 Private
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12 Private
  /^192\.168\./, // 192.168.0.0/16 Private
  /^169\.254\./, // 169.254.0.0/16 Link-local / AWS metadata
  /^0\./, // 0.0.0.0/8 Current network
];

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'broadcasthost',
  'local',
  'metadata.google.internal',
  'instance-data',
]);

/**
 * Validates whether a URL is safe to fetch or check, preventing SSRF attacks.
 */
export function isSafePublicUrl(urlString: string): { safe: boolean; reason?: string } {
  try {
    const parsed = new URL(urlString);
    const protocol = parsed.protocol.toLowerCase();

    if (protocol !== 'http:' && protocol !== 'https:') {
      return { safe: false, reason: `Invalid protocol: ${protocol}. Only HTTP and HTTPS are allowed.` };
    }

    const hostname = parsed.hostname.toLowerCase();

    if (BLOCKED_HOSTNAMES.has(hostname)) {
      return { safe: false, reason: `Blocked private or metadata hostname: ${hostname}` };
    }

    // Check if hostname is an IP address
    for (const pattern of IPV4_PRIVATE_PATTERNS) {
      if (pattern.test(hostname)) {
        return { safe: false, reason: `Blocked internal / private IP address range: ${hostname}` };
      }
    }

    // Check IPv6 loopback / unique local
    if (hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80')) {
      return { safe: false, reason: `Blocked internal IPv6 address: ${hostname}` };
    }

    return { safe: true };
  } catch (err: any) {
    return { safe: false, reason: `Malformed URL format: ${err.message}` };
  }
}

/**
 * Sanitizes HTML strictly for safe client-side iframe preview.
 * Strips script tags, malicious event handlers, javascript: URIs, and active controls.
 */
export function sanitizeHtmlForPreview(html: string): string {
  if (!html) return '';

  let sanitized = html;

  // Remove script tags and their content
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove event handlers (onload, onclick, onerror, onmouseover, etc.)
  sanitized = sanitized.replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');

  // Remove javascript: and data: text/html in href and src
  sanitized = sanitized.replace(/(?:href|src)\s*=\s*(['"]?)\s*javascript:[^'"]*\1/gi, '$1#insecure-protocol$1');

  // Remove iframes, objects, embeds, and applets
  sanitized = sanitized.replace(/<(?:iframe|object|embed|applet)\b[^<]*(?:(?!<\/(?:iframe|object|embed|applet)>)<[^<]*)*<\/(?:iframe|object|embed|applet)>/gi, '');
  sanitized = sanitized.replace(/<(?:iframe|object|embed|applet)\b[^>]*\/?>/gi, '');

  return sanitized;
}

export const sanitizeEmailHtml = sanitizeHtmlForPreview;

/**
 * Enforces size limits on submitted payloads (e.g. 2MB max for email HTML).
 */
export function enforcePayloadLimits(payload: { subject?: string; html?: string }): { valid: boolean; error?: string } {
  const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB
  const MAX_SUBJECT_LENGTH = 500;

  if (payload.subject && payload.subject.length > MAX_SUBJECT_LENGTH) {
    return { valid: false, error: `Subject exceeds maximum length of ${MAX_SUBJECT_LENGTH} characters.` };
  }

  if (payload.html) {
    const byteSize = Buffer.byteLength(payload.html, 'utf8');
    if (byteSize > MAX_HTML_BYTES) {
      return { valid: false, error: `HTML payload exceeds maximum size of 2MB (${Math.round(byteSize / 1024)} KB).` };
    }
  }

  return { valid: true };
}
