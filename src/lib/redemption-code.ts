import { CODE_ALPHABET, randomCodeSegment, normalizeCode } from "@/lib/codes";

// Format: NS-XXXX-XXXX, e.g. NS-7K4P-X9QM. ~32^8 (~1.1 trillion) possible
// codes from this alphabet, combined with a DB uniqueness check.
export function generateRedemptionCode(): string {
  return `NS-${randomCodeSegment(4)}-${randomCodeSegment(4)}`;
}

const CODE_SHAPE = new RegExp(
  `^NS-[${CODE_ALPHABET}]{4}-[${CODE_ALPHABET}]{4}$`,
);

export const normalizeRedemptionCode = normalizeCode;

export function isValidRedemptionCodeShape(code: string): boolean {
  return CODE_SHAPE.test(code);
}
