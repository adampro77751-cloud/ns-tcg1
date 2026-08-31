import { randomInt } from "crypto";

// Excludes visually ambiguous characters (0/O, 1/I/L) so printed/shared
// codes are easy to type correctly by hand.
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function randomCodeSegment(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    // crypto.randomInt is cryptographically secure and free of modulo bias,
    // unlike Math.random() — codes must not be predictable/guessable.
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}
