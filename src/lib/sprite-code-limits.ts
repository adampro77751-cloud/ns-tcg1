// Pure constants, deliberately with zero server-only imports (no Prisma) so
// this can be safely imported from client components too.
export const MIN_CODES_PER_BATCH = 1;
export const MAX_CODES_PER_BATCH = 1000;
