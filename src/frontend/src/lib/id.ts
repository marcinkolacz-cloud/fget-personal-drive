/**
 * Generates a cryptographically secure 32-byte random ID as hex string.
 * This is the single source of truth for all file and folder upload IDs.
 */
export function generateSecure32ByteId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
