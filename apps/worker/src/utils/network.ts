export function parseHost(value: string): string {
  return value.split(':')[0];
}
