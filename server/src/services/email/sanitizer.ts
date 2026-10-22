/**
 * Email content sanitizer and security helpers
 */

/**
 * Escapes HTML characters in user-supplied strings to prevent XSS and HTML injection in emails.
 */
export function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) {
    return '';
  }
  const str = String(input);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitizes header fields (e.g. Subject, To) by stripping carriage returns and newlines
 * to prevent SMTP header injection attacks.
 */
export function sanitizeHeader(input: unknown): string {
  if (input === null || input === undefined) {
    return '';
  }
  return String(input)
    .replace(/[\r\n]+/g, '')
    .trim();
}

/**
 * Validates whether an email string looks like a standard valid email address.
 */
export function isValidEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  // Simple RFC 5322 compatible regex check
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(trimmed);
}

/**
 * Sanitizes an error message by stripping potential credentials, tokens, or private paths.
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  const msg = error instanceof Error ? error.message : String(error);

  // Redact potential passwords, tokens, auth headers
  return msg
    .replace(/password[:=]\s*[^\s,;]+/gi, 'password=[REDACTED]')
    .replace(/bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/auth[:=]\s*[^\s,;]+/gi, 'auth=[REDACTED]')
    .replace(/pass[:=]\s*[^\s,;]+/gi, 'pass=[REDACTED]')
    .replace(/token[:=]\s*[a-zA-Z0-9._-]+/gi, 'token=[REDACTED]')
    .slice(0, 500); // Bounded size
}
