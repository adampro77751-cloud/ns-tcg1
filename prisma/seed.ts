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

  // The three NS TCG formats. Banned and restricted cards aren't seeded
  // here since no real Card data exists yet — add those once real cards
  // are entered. Basic/Historic share the same deck-construction rules
  // (kept as separate Format rows so their legality can diverge later);
  // Quickfire is fixed at exactly 10 cards.
  const basic = await prisma.format.upsert({
    where: { slug: "basic" },
    update: {
      minDeckSize: 30,
      maxDeckSize: null,
      maxCopiesPerCard: 3,
      startingHand: 5,
      startingHealth: 500,
      allowedSets: serializeAllowedSets(null),
    },
    create: {
      name: "Basic",
      slug: "basic",
      description: "The main standard NS TCG format.",
      minDeckSize: 30,
      maxDeckSize: null,
      maxCopiesPerCard: 3,
      startingHand: 5,
      startingHealth: 500,
      allowedSets: serializeAllowedSets(null),
    },
  });

  const historic = await prisma.format.upsert({
    where: { slug: "historic" },
    update: {
      minDeckSize: 30,
      maxDeckSize: null,
      maxCopiesPerCard: 3,
      startingHand: 5,
      startingHealth: 500,
      allowedSets: serializeAllowedSets(null),
    },
    create: {
      name: "Historic",
      slug: "historic",
      description: "The historic NS TCG card-pool format.",
      minDeckSize: 30,
      maxDeckSize: null,
      maxCopiesPerCard: 3,
      startingHand: 5,
      startingHealth: 500,
      allowedSets: serializeAllowedSets(null),
    },
  });

  const quickfire = await prisma.format.upsert({
    where: { slug: "quickfire" },
    update: {
      minDeckSize: 10,
      maxDeckSize: 10,
      maxCopiesPerCard: 3,
      startingHand: 3,
      startingHealth: 200,
      allowedSets: serializeAllowedSets(null),
    },
    create: {
      name: "Quickfire",
      slug: "quickfire",
      description: "A fast 10-card NS TCG format.",
      minDeckSize: 10,
      maxDeckSize: 10,
      maxCopiesPerCard: 3,
      startingHand: 3,
      startingHealth: 200,
      allowedSets: serializeAllowedSets(null),
    },
  });
  console.log(
    `Formats present: ${basic.name}, ${historic.name}, ${quickfire.name}.`,
  );

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
