// ルール。表を歩く青と、裏を歩く橙を、同時に同じ向きへ動かして、それぞれのゴールへ届ける。
// 盤は1枚の膜で、表から見た山は裏から見ると穴、表から見た谷は裏から見ると壁になる。
// このフォルダ（src/game）は画面の処理に触れない。document・Canvas・Math.random は使わない。
import { DIRS, hexOf, inBoard, keyOf, type Hex } from './hex';

export type Status = 'playing' | 'cleared' | 'failed';
export type Walker = 'blue' | 'orange';

export interface Level {
  radius: number;
  /** [q, r, 高さ]。高さは 1（山）か -1（谷） */
  bumps: (readonly [q: number, r: number, height: number])[];
  blue: Hex;
  orange: Hex;
  blueGoal: Hex;
  orangeGoal: Hex;
  /** マスを山や谷に変えられる回数 */
  edits: number;
  /** ★3 になる手数（最少の手数） */
  par: number;
}

export interface State {
  radius: number;
  /** 平らでないマスの高さ。1 が山、-1 が谷 */
  height: Record<string, number>;
  blue: string;
  orange: string;
  blueGoal: string;
  orangeGoal: string;
  editsLeft: number;
  moves: number;
  par: number;
  /** この手数までに届かなければ失敗 */
  limit: number;
  status: Status;
  /** 落ちた駒。落ちていなければ null */
  fell: Walker | null;
}

/** ★3 の手数より、何手多く使えるか */
export const EXTRA_MOVES = 4;

export function createState(level: Level, limit: number = level.par + EXTRA_MOVES): State {
  return {
    radius: level.radius,
    height: Object.fromEntries(level.bumps.map(([q, r, h]) => [keyOf(q, r), h])),
    blue: keyOf(...level.blue),
    orange: keyOf(...level.orange),
    blueGoal: keyOf(...level.blueGoal),
    orangeGoal: keyOf(...level.orangeGoal),
    editsLeft: level.edits,
    moves: 0,
    par: level.par,
    limit,
    status: 'playing',
    fell: null,
  };
}

/** その駒から見たマスの高さ。青は表を歩くのでそのまま、橙は裏を歩くので逆になる */
const seenBy = (state: State, walker: Walker, cell: string): number => (state.height[cell] ?? 0) * (walker === 'blue' ? 1 : -1);

/** 1歩進んだ先のマス。盤の外や壁（自分から見て高いマス）なら、その場に残る */
function stepOf(state: State, walker: Walker, dir: number): string {
  const from = state[walker];
  const [q, r] = hexOf(from);
  const [dq, dr] = DIRS[dir];
  if (!inBoard(q + dq, r + dr, state.radius)) return from;
  const to = keyOf(q + dq, r + dr);
  return seenBy(state, walker, to) > 0 ? from : to;
}

const afterMove = (state: State): State => {
  const moves = state.moves + 1;
  const done = state.blue === state.blueGoal && state.orange === state.orangeGoal;
  const status: Status = state.fell ? 'failed' : done ? 'cleared' : moves >= state.limit ? 'failed' : 'playing';
  return { ...state, moves, status };
};

/**
 * 青と橙を同時に同じ向きへ1歩動かした後の状態を新しく返す（元の状態は変えない）。
 * どちらも動けない向きなら null。穴（自分から見て低いマス）に入った駒は落ちて、失敗になる。
 */
export function move(state: State, dir: number): State | null {
  if (state.status !== 'playing' || !DIRS[dir]) return null;
  const blue = stepOf(state, 'blue', dir), orange = stepOf(state, 'orange', dir);
  if (blue === state.blue && orange === state.orange) return null;
  const next = { ...state, blue, orange };
  const fell: Walker | null = seenBy(next, 'blue', blue) < 0 ? 'blue' : seenBy(next, 'orange', orange) < 0 ? 'orange' : null;
  return afterMove({ ...next, fell });
}

/**
 * マスを1段上げる（delta = 1）か下げる（delta = -1）。1手として数える。
 * 駒のいるマス・ゴールのマスは変えられない。高さは山・平ら・谷の3つだけ。
 */
export function edit(state: State, cell: string, delta: 1 | -1): State | null {
  if (state.status !== 'playing' || state.editsLeft <= 0) return null;
  const [q, r] = hexOf(cell);
  if (!inBoard(q, r, state.radius)) return null;
  if ([state.blue, state.orange, state.blueGoal, state.orangeGoal].includes(cell)) return null;
  const to = (state.height[cell] ?? 0) + delta;
  if (to < -1 || to > 1) return null;
  const height = { ...state.height };
  if (to === 0) delete height[cell];
  else height[cell] = to;
  return afterMove({ ...state, height, editsLeft: state.editsLeft - 1 });
}

/** クリアした時の星の数 */
export function starsOf(state: State): number {
  if (state.status !== 'cleared') return 0;
  if (state.moves <= state.par) return 3;
  if (state.moves <= state.par + 2) return 2;
  return 1;
}
