// 全ステージを解いて、最少の手数と、かかった時間を出す。
// 使い方: npm run check
import { LEVELS } from '../src/game/levels';
import { solve } from '../src/game/solve';

LEVELS.forEach((level, i) => {
  const began = performance.now();
  const best = solve(level, level.par + 1);
  const ms = Math.round(performance.now() - began);
  console.log(`ステージ ${i + 1}: par ${level.par}・最少 ${best ? best.length : '解けない'}・${ms} ms`);
});
