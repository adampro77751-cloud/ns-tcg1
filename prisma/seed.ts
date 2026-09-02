import { prisma } from "../src/lib/prisma";
import { serializeAllowedSets } from "../src/lib/formats";

// Real NS TCG Sprites. Rarity is authoritative (given). description,
// image, set, and releaseDate are intentionally left unset rather than
// invented. Per-level abilities (level1Ability..level5Ability) are filled
// in only where the real text is known — left unset for the rest rather
// than guessed.
type SpriteSeed = {
  name: string;
  slug: string;
  rarity: "RARE" | "MYTHIC" | "LEGENDARY";
  level1Ability?: string;
  level2Ability?: string;
  level3Ability?: string;
  level4Ability?: string;
  level5Ability?: string;
};

const sprites: SpriteSeed[] = [
  {
    name: "Water Sprite",
    slug: "water-sprite",
    rarity: "RARE",
    level1Ability: "Your cards get +10 Speed.",
    level2Ability: "Your cards get +20 Speed.",
    level3Ability: "When you play your second spell in a turn, draw a card.",
    level4Ability: "You may play Spells during your opponent's turn.",
    level5Ability: "You may play 1 additional Spell each turn.",
  },
  {
    name: "Fire Sprite",
    slug: "fire-sprite",
    rarity: "RARE",
    level1Ability: "If you would deal damage to an opponent, deal an additional 10 damage.",
    level2Ability: "If you would deal damage to an opponent, deal an additional 20 damage.",
    level3Ability: "If you would deal over 100 damage at 1 time, draw a card.",
    level4Ability: "All items you control get +20 attack.",
    level5Ability: "All items you control get +40 attack.",
  },
  { name: "Air Sprite", slug: "air-sprite", rarity: "RARE" },
  { name: "Earth Sprite", slug: "earth-sprite", rarity: "RARE" },
  { name: "Ninja Sprite", slug: "ninja-sprite", rarity: "MYTHIC" },
  {
    name: "Angel Sprite",
    slug: "angel-sprite",
    rarity: "MYTHIC",
    level1Ability: "Whenever you gain Health, gain an additional 10 Health.",
    level2Ability: "Whenever you gain Health, gain an additional 20 Health.",
    level3Ability: "The first time you gain Health each turn, draw a card.",
    level4Ability: "Once per turn, prevent 30 damage dealt to you.",
    level5Ability:
      "The first time you would lose the game, set your Health to 100 instead.",
  },
  {
    name: "Devil Sprite",
    slug: "devil-sprite",
    rarity: "MYTHIC",
    level1Ability: "Your Items get +10 Attack.",
    level2Ability: "Your Items get +20 Attack.",
    level3Ability: "Once per turn, lose 20 Health to draw a card.",
    level4Ability: "Once per turn, lose 30 Health to play an additional Item.",
    level5Ability:
      "The first time you lose Health each turn, your Items get +40 Attack this turn.",
  },
  { name: "Cosmic Sprite", slug: "cosmic-sprite", rarity: "LEGENDARY" },
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
  // Rarity for each of these reuses whatever this same card already had in
  // the database (see the ~50 pre-existing Card rows) rather than the
  // "UNSPECIFIED" given for most of them here. Only Chemistry Lesson and
  // Blast From The Post are genuinely new cards with no prior rarity on
  // record, so those stay "TBD".
  {
    // Existing DB name is "Sasuage Roll 3" — kept as-is rather than
    // renamed to the "Sasuage Roll" given here, since it's unclear whether
    // the "3" was dropped intentionally or is just shorthand.
    name: "Sasuage Roll 3",
    slug: "sasuage-roll-3",
    type: "Item",
    rarity: "Legendary",
    set: "1st Edition",
    attack: 95,
    defence: 70,
    speed: 80,
    rulesText:
      "When this enters, target opponent reveals their hand and you choose one card. Put it into play under your control.\n\n(You give this card back after the match)",
  },
  {
    // Casing corrected to match the existing "IT Support" card's
    // convention (was "It Room").
    name: "IT Room",
    slug: "it-room",
    type: "Item",
    rarity: "Legendary",
    set: "1st Edition",
    attack: 80,
    defence: 70,
    speed: 90,
    rulesText:
      "When this enters, put a card from your hand into play under your control, then draw a card.",
  },
  {
    name: "Budge, Cathedral Cat",
    slug: "budge",
    type: "Commander",
    rarity: "Legendary",
    set: "1st Edition",
    attack: 80,
    defence: 60,
    speed: 90,
    rulesText:
      "Whenever you play an Item, draw a card.\n\nWhenever you play a Spell, draw 2 cards.\n\nWhenever Budge attacks, search your library for a card, then put it into your hand unless you have 3 or more Spells in your discard pile. If you do, put that card into play instead.",
  },
  {
    name: "Revision",
    slug: "revision",
    type: "Spell",
    rarity: "Legendary",
    set: "1st Edition",
    rulesText: "You may play any number of Spells this turn.",
  },
  {
    name: "Super Drop",
    slug: "super-drop",
    type: "Spell",
    rarity: "Legendary",
    set: "1st Edition",
    rulesText: "You may play 3 additional Item cards or Spell cards this turn.",
  },
  {
    name: "Cathedral Pergrines",
    slug: "cathedral-pergrines",
    type: "Commander",
    rarity: "Legendary",
    set: "1st Edition",
    attack: 80,
    defence: 80,
    speed: 110,
    rulesText:
      "Dive Bomb — At the beginning of the attack step, you may discard a card. If you do, search your deck for any Item and put it onto the battlefield under your control.",
  },
  {
    name: "The Final Bell",
    slug: "the-final-bell",
    type: "Spell",
    rarity: "Legendary",
    set: "1st Edition",
    rulesText: "All Items you control become copies of target Item permanently.",
  },
  {
    name: "Exam Marking",
    slug: "exam-marking",
    type: "Spell",
    rarity: "Mythic",
    set: "1st Edition",
    rulesText: "Look at target opponent's hand. Choose 1 card. They discard that card.",
  },
  {
    name: "Chemistry Lesson",
    slug: "chemistry-lesson",
    type: "Spell",
    rarity: "TBD",
    set: "1st Edition",
    rulesText: "Return target Item card from your discard pile to play under your control.",
  },
  {
    name: "Bio Worm",
    slug: "bio-worm",
    type: "Item",
    rarity: "Epic",
    set: "1st Edition",
    attack: 70,
    defence: 60,
    speed: 60,
    rulesText: "When Bio Worm attacks, target opponent discards a card.",
  },
  {
    name: "Biologist",
    slug: "biologist",
    type: "Item",
    rarity: "Epic",
    set: "1st Edition",
    attack: 60,
    defence: 50,
    speed: 70,
    rulesText: "You may play 2 Items a turn.",
  },
  {
    name: "Reflection",
    slug: "reflection",
    type: "Spell",
    rarity: "Epic",
    set: "1st Edition",
    rulesText: "Put target Item into its owner's discard pile.",
  },
  {
    name: "DNA",
    slug: "dna",
    type: "Item",
    rarity: "Epic",
    set: "1st Edition",
    attack: 80,
    defence: 50,
    speed: 70,
    rulesText: "Whenever an Item enters, deal 20 damage to any target and draw 1 card.",
  },
  {
    name: "Time Bomb",
    slug: "time-bomb",
    type: "Item",
    rarity: "Epic",
    set: "1st Edition",
    attack: 30,
    defence: 50,
    speed: 60,
    rulesText:
      "Whenever you cast a Spell, place a charge counter on this card.\n\nRemove 10 charge counters: Win the game.",
  },
  {
    // Existing DB name is "Lunch Card" — treated as the same card as the
    // "Lunch Cord" given here (assumed typo), name kept as-is.
    name: "Lunch Card",
    slug: "lunch-card",
    type: "Item",
    rarity: "Rare",
    set: "1st Edition",
    attack: 30,
    defence: 40,
    speed: 100,
    rulesText: "If this card is discarded, return it to play under your control.",
  },
  {
    name: "Phone",
    slug: "phone",
    type: "Item",
    rarity: "Rare",
    set: "1st Edition",
    attack: 65,
    defence: 75,
    speed: 80,
  },
  {
    name: "Table Tennis Table",
    slug: "table-tennis-table",
    type: "Item",
    rarity: "Rare",
    set: "1st Edition",
    attack: 65,
    defence: 75,
    speed: 55,
  },
  {
    name: "Cupcake",
    slug: "cupcake",
    type: "Item",
    rarity: "Rare",
    set: "1st Edition",
    attack: 60,
    defence: 50,
    speed: 80,
  },
  {
    name: "Cathedral",
    slug: "cathedral",
    type: "Item",
    rarity: "Rare",
    set: "1st Edition",
    attack: 45,
    defence: 80,
    speed: 20,
  },
  {
    // Kept literal as given — flagged separately as a possible typo for
    // "Blast From The Past" rather than silently changed.
    name: "Blast From The Post",
    slug: "blast-from-the-post",
    type: "Spell",
    rarity: "TBD",
    set: "1st Edition",
    rulesText: "Return up to 2 target cards from your discard pile to your hand.",
  },
  {
    // New card, no rarity on record — not guessed.
    name: "Mathomagics",
    slug: "mathomagics",
    type: "Spell",
    rarity: "TBD",
    set: "1st Edition",
    rulesText: "Draw 3 cards.",
  },
  {
    name: "Pencil Case",
    slug: "pencil-case",
    type: "Item",
    rarity: "Rare",
    set: "1st Edition",
    attack: 70,
    defence: 70,
    speed: 50,
  },
  {
    name: "Hockey Stick",
    slug: "hockey-stick",
    type: "Item",
    rarity: "Rare",
    set: "1st Edition",
    attack: 75,
    defence: 60,
    speed: 50,
  },
  {
    // New card, no rarity on record — not guessed.
    name: "School Bag",
    slug: "school-bag",
    type: "Spell",
    rarity: "TBD",
    set: "1st Edition",
    rulesText: "Discard your hand, then draw 7 cards.",
  },
  {
    // New card, no rarity on record — not guessed.
    name: "Radnor Springs",
    slug: "radnor-springs",
    type: "Item",
    rarity: "TBD",
    set: "1st Edition",
    attack: 50,
    defence: 70,
    speed: 30,
    rulesText: "Draw 2 cards, then discard 1 card.",
  },
  {
    name: "Physics",
    slug: "physics",
    type: "Spell",
    rarity: "Rare",
    set: "1st Edition",
    rulesText:
      "Put target card into its owner's discard pile, then put it into play under its owner's control.",
  },
  {
    name: "Library",
    slug: "library",
    type: "Item",
    rarity: "Rare",
    set: "1st Edition",
    attack: 40,
    defence: 50,
    speed: 40,
    rulesText:
      "When this enters, you may play target Spell from your discard pile even if you've already played the maximum number of Spells this turn; then this deals 20 damage to any target.",
  },
  {
    name: "Art",
    slug: "art",
    type: "Spell",
    rarity: "Rare",
    set: "1st Edition",
    rulesText: "You may play Spells from your discard pile this turn.",
  },
  {
    name: "School Computers",
    slug: "school-computers",
    type: "Item",
    rarity: "Rare",
    set: "1st Edition",
    attack: 60,
    defence: 50,
    speed: 70,
    rulesText: "When this attacks, target player reveals their hand.",
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
