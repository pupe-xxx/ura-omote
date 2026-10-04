// ステージの一覧。最初の4つは遊び方を覚えるための手作り。残りは scripts/gen.ts が作る。
import { GENERATED } from './levels.gen';
import type { Level } from './rules';

const INTRO: Level[] = [
  // 2つは同時に同じ向きへ動く
  { radius: 2, bumps: [], blue: [-1, 0], orange: [-1, 1], blueGoal: [1, 0], orangeGoal: [1, 1], edits: 0, par: 2 },
  // 青は山で止まる。その間に橙だけが進む
  { radius: 2, bumps: [[1, 0, 1]], blue: [-2, 0], orange: [-2, 1], blueGoal: [0, 0], orangeGoal: [1, 1], edits: 0, par: 3 },
  // 橙は谷で止まる。その間に青だけが進む
  { radius: 2, bumps: [[1, 1, -1]], blue: [-2, 0], orange: [-2, 1], blueGoal: [1, 0], orangeGoal: [0, 1], edits: 0, par: 3 },
  // 山は自分で作れる
  { radius: 2, bumps: [[-1, -1, -1], [0, -2, -1], [2, -1, 1], [-2, 2, 1], [0, 2, -1]], blue: [-2, 0], orange: [-2, 1], blueGoal: [0, 0], orangeGoal: [1, 1], edits: 1, par: 4 },
];

export const LEVELS: Level[] = [...INTRO, ...GENERATED];
