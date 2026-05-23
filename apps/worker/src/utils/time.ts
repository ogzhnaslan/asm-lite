export function daysUntil(isoString: string | null | undefined): number | null {
  if (!isoString) return null;
  return Math.floor((new Date(isoString).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function now(): Date {
  return new Date();
}
