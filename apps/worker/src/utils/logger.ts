export function log(tag: string, data?: unknown): void {
  if (data !== undefined) {
    console.log(`[worker] ${tag}`, data);
  } else {
    console.log(`[worker] ${tag}`);
  }
}
