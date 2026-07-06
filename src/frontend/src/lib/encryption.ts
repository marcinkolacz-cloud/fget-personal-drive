// Client-side AES-GCM encryption with PBKDF2 key derivation
// Header format: "FGETENC" (7 bytes) + salt (16 bytes) + IV (12 bytes) = 35 bytes total

const MAGIC = new TextEncoder().encode("FGETENC"); // 7 bytes
const SALT_LEN = 16;
const IV_LEN = 12;
const HEADER_LEN = MAGIC.length + SALT_LEN + IV_LEN; // 35

/** Copy any Uint8Array into a plain ArrayBuffer to satisfy Web Crypto API types. */
function toArrayBuffer(arr: Uint8Array): ArrayBuffer {
  return arr.buffer.slice(
    arr.byteOffset,
    arr.byteOffset + arr.byteLength,
  ) as ArrayBuffer;
}

export async function encryptBytes(
  bytes: Uint8Array,
  password: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(password, salt);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      toArrayBuffer(bytes),
    ),
  );
  const result = new Uint8Array(
    HEADER_LEN + encrypted.length,
  ) as Uint8Array<ArrayBuffer>;
  result.set(MAGIC, 0);
  result.set(salt, MAGIC.length);
  result.set(iv, MAGIC.length + SALT_LEN);
  result.set(encrypted, HEADER_LEN);
  return result;
}

export async function decryptBytes(
  encryptedData: Uint8Array,
  password: string,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!isEncryptedBytes(encryptedData))
    throw new Error("Not an encrypted file");
  const salt = encryptedData.slice(MAGIC.length, MAGIC.length + SALT_LEN);
  const iv = encryptedData.slice(MAGIC.length + SALT_LEN, HEADER_LEN);
  const data = encryptedData.slice(HEADER_LEN);
  const key = await deriveKey(password, salt);
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      toArrayBuffer(data),
    );
    return new Uint8Array(decrypted) as Uint8Array<ArrayBuffer>;
  } catch {
    throw new Error("Decryption failed. Wrong password?");
  }
}

export function isEncryptedBytes(bytes: Uint8Array): boolean {
  if (bytes.length < HEADER_LEN) return false;
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) return false;
  }
  return true;
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
