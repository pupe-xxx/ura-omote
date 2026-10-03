// ステージを作って src/game/levels.gen.ts に書き出す。
// 使い方: npm run gen
// 乱数の種は固定なので、何度実行しても同じステージができる。段階（TIERS）を変えた時だけ中身が変わる。
import { writeFileSync } from 'node:fs';
import { boardCells, type Hex } from '../src/game/hex';
import type { Level } from '../src/game/rules';
import { solve } from '../src/game/solve';
import { createRng, type Rng } from '../src/kit/rng';

type Range = readonly [min: number, max: number];

interface Tier {
  radius: number;
  /** 山か谷になっているマスの割合 */
  density: Range;
  edits: number;
  par: Range;
  count: number;
}

// 後ろの段階ほど、手数が多い。盤を変えられる回数が多い段階は、総当たりが重いので盤を小さくしている
const TIERS: Tier[] = [
  { radius: 2, density: [0.25, 0.4], edits: 0, par: [4, 6], count: 3 },
  { radius: 2, density: [0.3, 0.45], edits: 1, par: [5, 7], count: 4 },
  { radius: 3, density: [0.3, 0.45], edits: 0, par: [7, 10], count: 3 },
  { radius: 3, density: [0.3, 0.45], edits: 1, par: [7, 9], count: 5 },
  { radius: 2, density: [0.35, 0.5], edits: 2, par: [6, 9], count: 3 },
  { radius: 3, density: [0.35, 0.5], edits: 1, par: [10, 12], count: 3 },
];

function randomLevel(rng: Rng, tier: Tier): Level {
  const cells: Hex[] = boardCells(tier.radius);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const [blue, orange, blueGoal, orangeGoal] = cells.splice(0, 4);
  const density = tier.density[0] + rng.next() * (tier.density[1] - tier.density[0]);
  const bumps = cells.filter(() => rng.next() < density).map(([q, r]) => [q, r, rng.next() < 0.5 ? 1 : -1] as const);
  return { radius: tier.radius, bumps, blue, orange, blueGoal, orangeGoal, edits: tier.edits, par: 0 };
}

/** 面白いステージだけ通す。通ったら par を入れて返す */
function accept(level: Level, tier: Tier): Level | null {
  // 2つの駒がゴールまで同じだけ離れていると、並んで歩くだけで着いてしまう
  if (level.blueGoal[0] - level.blue[0] === level.orangeGoal[0] - level.orange[0] && level.blueGoal[1] - level.blue[1] === level.orangeGoal[1] - level.orange[1]) return null;
  const best = solve(level, tier.par[1]);
  if (!best || best.length < tier.par[0]) return null;
  // 盤を変えられるなら、変える回数を1つ減らすと最少では解けないこと
  if (level.edits > 0 && solve({ ...level, edits: level.edits - 1 }, best.length + 1)) return null;
  return { ...level, par: best.length };
}

const levels: Level[] = [];
TIERS.forEach((tier, t) => {
  const rng = createRng(3000 + t);
  let found = 0;
  for (let tries = 0; found < tier.count && tries < 200000; tries++) {
    const level = accept(randomLevel(rng, tier), tier);
    if (!level) continue;
    levels.push(level);
    found++;
  }
  console.log(`段階 ${t + 1}: ${found} / ${tier.count}`);
});

const lines = levels.map((l) => `  ${JSON.stringify(l)},`);
writeFileSync(
  new URL('../src/game/levels.gen.ts', import.meta.url),
  `// scripts/gen.ts が書き出したステージ。手で直さない（直したい時は scripts/gen.ts を変えて npm run gen）。\nimport type { Level } from './rules';\n\nexport const GENERATED: Level[] = [\n${lines.join('\n')}\n];\n`,
);
console.log(`${levels.length} ステージを書き出した: src/game/levels.gen.ts`);
