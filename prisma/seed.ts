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
  { name: "Angel Sprite", slug: "angel-sprite", rarity: "MYTHIC" as const },
  { name: "Devil Sprite", slug: "devil-sprite", rarity: "MYTHIC" as const },
  { name: "Cosmic Sprite", slug: "cosmic-sprite", rarity: "LEGENDARY" as const },
];

const editions = [{ name: "1st Edition", slug: "1st-edition" }];

// Real NS TCG Cards. Rarity uses the same Title-Case values already present
// on the ~40 other Card rows in the database (Common/Rare/Epic/Legendary/
// Mythic) rather than inventing a second casing convention. Cards whose
// real rarity is not yet known are given the literal placeholder rarity
// "TBD" rather than guessing — never left as one of the five real values.
// attack/defence/speed/rulesText are left unset only where the real card
// genuinely has none (e.g. Home Clothes Day has no rules text).
type CardSeed = {
  name: string;
  slug: string;
  type: string;
  rarity: string;
  set: string;
  attack?: number;
  defence?: number;
  speed?: number;
  rulesText?: string;
};

const cards: CardSeed[] = [
  {
    name: "End Of Year Test",
    slug: "end-of-year-test",
    type: "Item",
    rarity: "TBD",
    set: "1st Edition",
    attack: 85,
    defence: 75,
    speed: 60,
    rulesText:
      "If this is in your hand at the beginning of the game, put it into play, then draw 2 cards.",
  },
  {
    name: "Parker",
    slug: "parker",
    type: "Spell",
    rarity: "Legendary",
    set: "1st Edition",
    rulesText: "Deal 100 damage to any target. Gain 100 health.",
  },
  {
    name: "Nelson",
    slug: "nelson",
    type: "Spell",
    rarity: "Mythic",
    set: "1st Edition",
    rulesText:
      "Prevent all damage dealt to you this turn. You may play this card on your opponent's turn.",
  },
  {
    name: "Seagrim",
    slug: "seagrim",
    type: "Spell",
    rarity: "Epic",
    set: "1st Edition",
    rulesText:
      "Draw 2 cards. Deal 100 damage to any target. Target opponent discards 2 cards.",
  },
  {
    name: "School",
    slug: "school",
    type: "Spell",
    rarity: "Common",
    set: "1st Edition",
    rulesText: "Search your deck for an Item card and put it under your control.",
  },
  {
    name: "Valpy",
    slug: "valpy",
    type: "Spell",
    rarity: "Rare",
    set: "1st Edition",
    rulesText: "Draw 3 cards and put up to 2 of those cards into play.",
  },
  {
    name: "Coke",
    slug: "coke",
    type: "Spell",
    rarity: "Rare",
    set: "1st Edition",
    rulesText:
      "Move target Spell or Item your opponent controls into their discard pile. You may play this Spell on your opponent's turn.",
  },
  {
    name: "Repton",
    slug: "repton",
    type: "Spell",
    rarity: "Legendary",
    set: "1st Edition",
    rulesText: "Gain control of target Item your opponent controls. Draw a card.",
  },
  {
    name: "Home Clothes Day",
    slug: "home-clothes-day",
    type: "Item",
    rarity: "Mythic",
    set: "1st Edition",
    attack: 85,
    defence: 80,
    speed: 80,
  },
  {
    name: "Brooke",
    slug: "brooke",
    type: "Spell",
    rarity: "TBD",
    set: "1st Edition",
    rulesText: "All Item cards get +100 Attack, +100 Speed and +100 Defense.",
  },
  {
    name: "Pi",
    slug: "pi",
    type: "Spell",
    rarity: "TBD",
    set: "1st Edition",
    rulesText:
      "Return all Spell cards from your discard pile to your hand. You may play them this turn.",
  },
  {
    name: "The Curriculum",
    slug: "the-curriculum",
    type: "Champion",
    rarity: "TBD",
    set: "1st Edition",
    attack: 50,
    defence: 70,
    speed: 90,
    rulesText:
      "When this enters play, choose Spells or Items.\n\nIf Items is chosen, no more Items can be played for the rest of the game.\n\nIf Spells is chosen, no more Spells can be played for the rest of the game.",
  },
];

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

  // "The Curriculum" previously existed under a misspelled slug
  // ("the-curriculam") with only a name/rarity placeholder. Repoint that
  // existing row at the correct slug first so the upsert below updates it
  // in place (preserving its id and any references to it) instead of
  // creating a second, duplicate "The Curriculum" row.
  const misspelledCurriculum = await prisma.card.findUnique({
    where: { slug: "the-curriculam" },
    select: { id: true },
  });
  if (misspelledCurriculum) {
    await prisma.card.update({
      where: { id: misspelledCurriculum.id },
      data: { slug: "the-curriculum" },
    });
  }

  for (const card of cards) {
    await prisma.card.upsert({
      where: { slug: card.slug },
      update: card,
      create: card,
    });
  }
  console.log(`Seeded ${cards.length} Cards.`);

  // The three NS TCG formats. Banned and restricted cards aren't seeded
  // here — add those once the card pool's legality needs diverge.
  // Basic/Historic share the same deck-construction rules
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
      maxCopiesPerCard: 2,
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
      maxCopiesPerCard: 2,
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
