import { prisma } from "@/lib/prisma";

export function getPacks() {
  return prisma.pack.findMany({ orderBy: { priceCents: "asc" } });
}
