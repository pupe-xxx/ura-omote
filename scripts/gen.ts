// ステージを作って src/game/levels.gen.ts に書き出す。
// 使い方: npm run gen
// 乱数の種は固定なので、何度実行しても同じステージができる。段階（TIERS）を変えた時だけ中身が変わる。
import { writeFileSync } from 'node:fs';
import { boardCells, rimCells, type Hex } from '../src/game/hex';
import type { Level } from '../src/game/rules';
import { solve } from '../src/game/solve';
import { createRng, type Rng } from '../src/kit/rng';

type Range = readonly [min: number, max: number];

interface Tier {
  radius: number;
  /** 青か橙になっているマスの割合 */
  density: Range;
  /** 2つとも止まる壁の数 */
  walls: Range;
  /** 2つとも落ちる穴の数 */
  pits: Range;
  /** まわりの壁のうち、無くす割合。0 なら全部ある、1 なら全部無い */
  open: Range;
  edits: number;
  par: Range;
  count: number;
}

// 後ろの段階ほど、手数が多い。段階 0〜1 は青と橙のマスだけ、2〜3 は壁と穴が出て、4〜5 はまわりの壁が無くなる。
// src/game/levels.ts が、段階の番号でステージを並べている。段階を足したり並べ替えたりしたら、そちらも直す
const TIERS: Tier[] = [
  { radius: 2, density: [0.25, 0.4], walls: [0, 0], pits: [0, 0], open: [0, 0], edits: 0, par: [4, 6], count: 3 },
  { radius: 2, density: [0.3, 0.45], walls: [0, 0], pits: [0, 0], open: [0, 0], edits: 1, par: [5, 7], count: 3 },
  { radius: 3, density: [0.2, 0.35], walls: [2, 4], pits: [2, 4], open: [0, 0], edits: 0, par: [7, 10], count: 4 },
  { radius: 3, density: [0.2, 0.35], walls: [2, 4], pits: [2, 4], open: [0, 0], edits: 1, par: [7, 9], count: 3 },
  { radius: 3, density: [0.2, 0.35], walls: [1, 3], pits: [1, 3], open: [0.3, 0.6], edits: 0, par: [7, 10], count: 4 },
  { radius: 3, density: [0.25, 0.4], walls: [2, 4], pits: [1, 3], open: [1, 1], edits: 0, par: [8, 11], count: 3 },
];

const between = (rng: Rng, [min, max]: Range) => min + rng.int(max - min + 1);
const within = (rng: Rng, [min, max]: Range) => min + rng.next() * (max - min);

function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function randomLevel(rng: Rng, tier: Tier): Level {
  const cells = shuffle(rng, boardCells(tier.radius));
  const [blue, orange, blueGoal, orangeGoal] = cells.splice(0, 4);
  const walls = cells.splice(0, between(rng, tier.walls));
  const pits = cells.splice(0, between(rng, tier.pits));
  const density = within(rng, tier.density);
  const bumps = cells.filter(() => rng.next() < density).map(([q, r]) => [q, r, rng.next() < 0.5 ? 1 : -1] as const);
  // まわりの壁は、ばらばらにではなく、続いた区間をまとめて無くす（見た時に、どこが開いているか分かりやすい）
  const rim = rimCells(tier.radius);
  const share = within(rng, tier.open);
  const begin = rng.int(rim.length);
  const open = share >= 1 ? rim : ringOrder(rim).filter((_, i) => (i - begin + rim.length) % rim.length < Math.round(share * rim.length));
  const level: Level = { radius: tier.radius, bumps, blue, orange, blueGoal, orangeGoal, edits: tier.edits, par: 0 };
  if (walls.length > 0) level.walls = walls;
  if (pits.length > 0) level.pits = pits;
  if (open.length > 0) level.open = open;
  return level;
}

/** 輪のマスを、ぐるっと1周する順に並べる */
function ringOrder(rim: Hex[]): Hex[] {
  const angle = ([q, r]: Hex) => Math.atan2(1.5 * r, Math.sqrt(3) * (q + r / 2));
  return [...rim].sort((a, b) => angle(a) - angle(b));
}

/** 面白いステージだけ通す。通ったら par を入れて返す */
function accept(level: Level, tier: Tier): Level | null {
  // 2つの駒がゴールまで同じだけ離れていると、並んで歩くだけで着いてしまう
  if (level.blueGoal[0] - level.blue[0] === level.orangeGoal[0] - level.orange[0] && level.blueGoal[1] - level.blue[1] === level.orangeGoal[1] - level.orange[1]) return null;
  const best = solve(level, tier.par[1]);
  if (!best || best.length < tier.par[0]) return null;
  // マスを変えられるなら、変える回数を1つ減らすと最少では解けないこと
  if (level.edits > 0 && solve({ ...level, edits: level.edits - 1 }, best.length + 1)) return null;
  // まわりの壁が無い所があるなら、それが効いていること（全部壁にした時と、最少の手数が違う）
  if (level.open) {
    const walled = solve({ ...level, open: [] }, best.length);
    if (walled && walled.length === best.length) return null;
  }
  return { ...level, par: best.length };
}

const tiers: Level[][] = TIERS.map((tier, t) => {
  const rng = createRng(3000 + t);
  const found: Level[] = [];
  for (let tries = 0; found.length < tier.count && tries < 300000; tries++) {
    const level = accept(randomLevel(rng, tier), tier);
    if (!level) continue;
    found.push(level);
    console.log(`  段階 ${t}: par ${level.par}・${tries + 1} 回目`);
  }
  console.log(`段階 ${t}: ${found.length} / ${tier.count}`);
  return found;
});

const blocks = tiers.map((levels) => `  [\n${levels.map((l) => `    ${JSON.stringify(l)},`).join('\n')}\n  ],`);
writeFileSync(
  new URL('../src/game/levels.gen.ts', import.meta.url),
  `// scripts/gen.ts が書き出したステージ。段階ごとに分かれている。手で直さない（直したい時は scripts/gen.ts を変えて npm run gen）。\nimport type { Level } from './rules';\n\nexport const GENERATED: Level[][] = [\n${blocks.join('\n')}\n];\n`,
);
console.log(`${tiers.flat().length} ステージを書き出した: src/game/levels.gen.ts`);
