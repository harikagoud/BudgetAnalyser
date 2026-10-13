import pino from 'pino';

// Structured logger with redaction for anything credential- or
// PII-adjacent, per Constitution Principle VI (Observability Without
// Sensitive Data Leakage). Redacted paths cover both top-level and nested
// occurrences across arrays/objects via pino's wildcard syntax.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'accessToken',
      '*.accessToken',
      '*.*.accessToken',
      'accessTokenEncrypted',
      '*.accessTokenEncrypted',
      'account.number',
      '*.account.number',
      'rawDescription',
      '*.rawDescription',
      'merchantRaw',
      '*.merchantRaw',
      'publicToken',
      '*.publicToken',
      'plaidSecret',
      '*.plaidSecret',
    ],
    censor: '[REDACTED]',
  },
});
