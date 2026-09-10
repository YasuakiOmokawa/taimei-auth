export function getValidServiceKeys(): string[] {
  const active = process.env.AUTH_SERVICE_KEY;
  const previous = process.env.AUTH_SERVICE_KEY_PREVIOUS;
  return [active, previous].filter((key): key is string => !!key);
}
