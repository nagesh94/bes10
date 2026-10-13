import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Column-level encryption for the one field that legally needs it.
 *
 * Aadhaar numbers are sensitive under the Aadhaar Act. We keep the last four
 * digits in clear so staff can recognise a record, and the full number
 * encrypted. Decryption happens only where the number is genuinely needed —
 * printing a document — and every such read is written to the audit log.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails loudly rather
 * than decrypting to rubbish. Stored as v1:<iv>:<tag>:<ciphertext>, all
 * base64, with the version prefix so the scheme can change later without
 * guessing at old rows.
 */

const VERSION = "v1";

function key(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw || raw.startsWith("generate-with")) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `FIELD_ENCRYPTION_KEY must decode to 32 bytes, got ${buf.length}. Generate one with: openssl rand -base64 32`,
    );
  }
  return buf;
}

export function encryptField(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(
    ":",
  );
}

export function decryptField(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Encrypted value is not in the expected format");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64!, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64!, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64!, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Digits only, so "1234 5678 9012" and "123456789012" are the same number. */
export function normaliseAadhaar(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function aadhaarLast4(raw: string): string {
  return normaliseAadhaar(raw).slice(-4);
}

/**
 * Aadhaar numbers carry a Verhoeff check digit. Catching a mistyped number
 * here is far cheaper than catching it when the DISCOM rejects the file.
 */
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function isValidAadhaar(raw: string): boolean {
  const digits = normaliseAadhaar(raw);
  if (digits.length !== 12) return false;
  if (digits[0] === "0" || digits[0] === "1") return false; // never issued

  let c = 0;
  const reversed = digits.split("").reverse().map(Number);
  for (let i = 0; i < reversed.length; i++) {
    c = D[c]![P[i % 8]![reversed[i]!]!]!;
  }
  return c === 0;
}

/** PAN is five letters, four digits, one letter. */
export function isValidPan(raw: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(raw.trim().toUpperCase());
}

/** IFSC is four letters, a zero, then six alphanumerics. */
export function isValidIfsc(raw: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(raw.trim().toUpperCase());
}

/** Constant-time compare, for anywhere a secret is checked. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
