/**
 * Strict URL sanitizer for citation links to prevent XSS (javascript:, data:, vbscript: schemes)
 */
export function isSafeHttpUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
