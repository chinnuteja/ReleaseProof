const secretKeyPattern = /(token|secret|password|api[_-]?key|authorization)/i;

export function redactValue(value: unknown, secrets: readonly string[] = []): unknown {
  if (typeof value === 'string') return redactText(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, secrets));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, secretKeyPattern.test(key) ? '[REDACTED]' : redactValue(nested, secrets)]));
  }
  return value;
}

export function redactText(text: string, secrets: readonly string[] = []): string {
  return secrets.filter(Boolean).reduce((result, secret) => result.split(secret).join('[REDACTED]'), text)
    .replace(/(Bearer\s+)[^\s]+/gi, '$1[REDACTED]');
}
