/**
 * Normalize text for Unicode-aware, case-insensitive, diacritics-insensitive search.
 * Converts text to lowercase and removes diacritics (accents) for comparison.
 */
export function normalizeForSearch(text: string): string {
  return (
    text
      .normalize("NFD") // Decompose combined characters into base + diacritics
      // biome-ignore lint/suspicious/noMisleadingCharacterClass: intentional Unicode range for diacritic removal
      .replace(/[\u0300-\u036f]/g, "") // Remove diacritical marks
      .toLowerCase()
  ); // Case-insensitive
}

/**
 * Check if a normalized haystack contains a normalized needle as a substring.
 */
export function containsNormalized(haystack: string, needle: string): boolean {
  const normalizedHaystack = normalizeForSearch(haystack);
  const normalizedNeedle = normalizeForSearch(needle);
  return normalizedHaystack.includes(normalizedNeedle);
}
