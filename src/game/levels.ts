// ステージの一覧。tip の付いたステージは遊び方を覚えるための手作り。残りは scripts/gen.ts が作る。
// 新しい仕掛け（壁と穴・まわりの壁が無い所）は、それを覚えるステージの後に出てくる。
import { rimCells } from './hex';
import { GENERATED } from './levels.gen';
import type { Level } from './rules';

const INTRO: Level[] = [
  // 2つは同時に同じ向きへ動く
  { tip: 'move', radius: 2, bumps: [], blue: [-1, 0], orange: [-1, 1], blueGoal: [1, 0], orangeGoal: [1, 1], edits: 0, par: 2 },
  // 青は青のマスで止まる。その間に橙だけが進む
  { tip: 'blue', radius: 2, bumps: [[1, 0, 1]], blue: [-2, 0], orange: [-2, 1], blueGoal: [0, 0], orangeGoal: [1, 1], edits: 0, par: 3 },
  // 橙は橙のマスで止まる。その間に青だけが進む
  { tip: 'orange', radius: 2, bumps: [[1, 1, -1]], blue: [-2, 0], orange: [-2, 1], blueGoal: [1, 0], orangeGoal: [0, 1], edits: 0, par: 3 },
  // マスは自分で変えられる
  { tip: 'edit', radius: 2, bumps: [[-1, -1, -1], [0, -2, -1], [2, -1, 1], [-2, 2, 1], [0, 2, -1]], blue: [-2, 0], orange: [-2, 1], blueGoal: [0, 0], orangeGoal: [1, 1], edits: 1, par: 4 },
];

// 灰色の壁は2つとも止まり、黒い穴は2つとも落ちる。壁も穴も、無いと最少の手数が変わる（どちらも効いている）
const WALL_INTRO: Level = {
  tip: 'wall', radius: 2, bumps: [], walls: [[-1, 1], [1, 1]], pits: [[0, 2], [0, 0]],
  blue: [0, 1], orange: [2, -1], blueGoal: [-1, 2], orangeGoal: [0, -1], edits: 0, par: 4,
};

// まわりの壁が無い所から外へ出ると落ちる。上の半分は壁が無い（全部壁なら3手で着くが、止まれないので4手かかる）
const EDGE_INTRO: Level = {
  tip: 'edge', radius: 2, bumps: [[-1, 2, -1]], open: rimCells(2).filter(([, r]) => r < 0),
  blue: [-1, 0], orange: [1, -2], blueGoal: [0, 1], orangeGoal: [1, -1], edits: 0, par: 4,
};

/** 段階（scripts/gen.ts の TIERS）の番号が from 以上 to 未満のステージ */
const tiers = (from: number, to: number): Level[] => GENERATED.slice(from, to).flat();

export const LEVELS: Level[] = [...INTRO, ...tiers(0, 2), WALL_INTRO, ...tiers(2, 4), EDGE_INTRO, ...tiers(4, 6)];
