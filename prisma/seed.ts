import { prisma } from "../src/lib/prisma";
import { serializeAllowedSets } from "../src/lib/formats";

// Real NS TCG Sprites. Rarity is authoritative (given). description,
// rulesText, image, set, and releaseDate are intentionally left unset
// rather than invented.
const sprites = [
  { name: "Water Sprite", slug: "water-sprite", rarity: "RARE" as const },
  { name: "Fire Sprite", slug: "fire-sprite", rarity: "RARE" as const },
  { name: "Air Sprite", slug: "air-sprite", rarity: "RARE" as const },
  { name: "Earth Sprite", slug: "earth-sprite", rarity: "RARE" as const },
  { name: "Ninja Sprite", slug: "ninja-sprite", rarity: "MYTHIC" as const },
  { name: "Dragon Sprite", slug: "dragon-sprite", rarity: "MYTHIC" as const },
  { name: "Cosmic Sprite", slug: "cosmic-sprite", rarity: "LEGENDARY" as const },
];

const editions = [{ name: "1st Edition", slug: "1st-edition" }];

async function main() {
  for (const edition of editions) {
    await prisma.edition.upsert({
      where: { slug: edition.slug },
      update: edition,
      create: edition,
    });
  }

  for (const sprite of sprites) {
    await prisma.sprite.upsert({
      where: { slug: sprite.slug },
      update: sprite,
      create: sprite,
    });
  }
  console.log(
    `Seeded ${sprites.length} Sprites (${editions.map((e) => e.name).join(", ")}).`,
  );

  // Deck-building formats. Unrelated to Sprites/cards; left as-is. Banned
  // and restricted cards aren't seeded here since no real Card data exists
  // yet — add those once real cards are entered.
  const standard = await prisma.format.upsert({
    where: { slug: "standard" },
    update: {
      minDeckSize: 30,
      maxDeckSize: 40,
      maxCopiesPerCard: 3,
      allowedSets: serializeAllowedSets(null),
    },
    create: {
      name: "Standard",
      slug: "standard",
      description: "The default competitive format. All sets are legal.",
      minDeckSize: 30,
      maxDeckSize: 40,
      maxCopiesPerCard: 3,
      allowedSets: serializeAllowedSets(null),
    },
  });

  const coreOnly = await prisma.format.upsert({
    where: { slug: "core-set-only" },
    update: {
      minDeckSize: 20,
      maxDeckSize: null,
      maxCopiesPerCard: 2,
      allowedSets: serializeAllowedSets(["Core Set"]),
    },
    create: {
      name: "Core Set Only",
      slug: "core-set-only",
      description: "Only cards from Core Set are legal.",
      minDeckSize: 20,
      maxDeckSize: null,
      maxCopiesPerCard: 2,
      allowedSets: serializeAllowedSets(["Core Set"]),
    },
  });
  console.log(`Formats present: ${standard.name}, ${coreOnly.name}.`);

  // Grant the ADMIN role to the existing "Admin" account, if it exists.
  // This never creates a new user — only an already-existing account named
  // exactly "Admin" is promoted, satisfying "do not create a second Admin
  // account" and avoiding a hardcoded `username === "Admin"` check anywhere
  // in application code (the role, once assigned here, is what the app
  // actually checks at runtime).
  const adminUpdate = await prisma.user.updateMany({
    where: { username: "Admin" },
    data: { role: "ADMIN" },
  });
  if (adminUpdate.count === 0) {
    console.warn(
      'No user with username "Admin" was found — create that account first, then re-run the seed to grant it the ADMIN role.',
    );
  } else {
    console.log('Granted ADMIN role to the "Admin" account.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
