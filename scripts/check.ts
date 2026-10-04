// 全ステージを解いて、最少の手数と、かかった時間を出す。
// 使い方: npm run check
import { LEVELS } from '../src/game/levels';
import { solve } from '../src/game/solve';

LEVELS.forEach((level, i) => {
  const began = performance.now();
  // par と関係なく、長めに探す（手作りのステージの par を決める時にも使うため）
  const best = solve(level, 16);
  const ms = Math.round(performance.now() - began);
  console.log(`ステージ ${i + 1}: par ${level.par}・最少 ${best ? best.length : '解けない'}・${ms} ms`);
});
