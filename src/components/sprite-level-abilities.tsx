import { MAX_SPRITE_LEVEL } from "@/lib/xp";

type SpriteWithAbilities = {
  level1Ability: string | null;
  level2Ability: string | null;
  level3Ability: string | null;
  level4Ability: string | null;
  level5Ability: string | null;
};

// Shared between the Sprite catalog page and an owned instance's page.
// `currentLevel`, when given, highlights the level the viewer is looking
// at (an owned instance) instead of just listing all five neutrally.
export function LevelAbilities({
  sprite,
  currentLevel,
}: {
  sprite: SpriteWithAbilities;
  currentLevel?: number;
}) {
  const abilities = [
    sprite.level1Ability,
    sprite.level2Ability,
    sprite.level3Ability,
    sprite.level4Ability,
    sprite.level5Ability,
  ];

  if (abilities.every((a) => !a)) return null;

  return (
    <div className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Level abilities
      </h2>
      <ul className="mt-2 flex flex-col gap-1.5">
        {abilities.map((ability, i) => {
          const level = i + 1;
          if (!ability) return null;
          const isCurrent = currentLevel === level;
          const isUnlocked =
            currentLevel !== undefined && currentLevel >= level;
          return (
            <li
              key={level}
              className={
                "rounded border px-3 py-2 text-sm " +
                (isCurrent
                  ? "border-amber-300 bg-amber-50"
                  : isUnlocked
                    ? "border-sky-200 bg-white"
                    : "border-sky-200 bg-sky-50 text-slate-400")
              }
            >
              <span className="mr-2 font-semibold">
                Level {level}
                {level === MAX_SPRITE_LEVEL ? " (MAX)" : ""}:
              </span>
              {ability}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
