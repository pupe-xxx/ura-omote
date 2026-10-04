// ルール。表を歩く青と、裏を歩く橙を、同時に同じ向きへ動かして、それぞれのゴールへ届ける。
// 盤は1枚の膜で、表から見た山は裏から見ると穴、表から見た谷は裏から見ると壁になる。
// 画面では、山を「青のマス」（青には壁・橙は落ちる）、谷を「橙のマス」（橙には壁・青は落ちる）として見せる。
// このフォルダ（src/game）は画面の処理に触れない。document・Canvas・Math.random は使わない。
import { DIRS, hexOf, inBoard, keyOf, type Hex } from './hex';

export type Status = 'playing' | 'cleared' | 'failed';
export type Walker = 'blue' | 'orange';

export interface Level {
  radius: number;
  /** [q, r, 高さ]。高さは 1（青のマス）か -1（橙のマス） */
  bumps: (readonly [q: number, r: number, height: number])[];
  /** 2つとも止まる壁 */
  walls?: Hex[];
  /** 2つとも落ちる穴 */
  pits?: Hex[];
  /** 盤のまわり（半径 + 1 の輪）のうち、壁が無いマス。ここから外へ出ると落ちる */
  open?: Hex[];
  blue: Hex;
  orange: Hex;
  blueGoal: Hex;
  orangeGoal: Hex;
  /** マスを青や橙に変えられる回数 */
  edits: number;
  /** ★3 になる手数（最少の手数） */
  par: number;
  /** このステージで出す一言の種類（遊び方を覚えるステージだけ） */
  tip?: 'move' | 'blue' | 'orange' | 'edit' | 'wall' | 'edge';
}

export interface State {
  radius: number;
  /** 平らでないマスの高さ。1 が青のマス、-1 が橙のマス */
  height: Record<string, number>;
  walls: string[];
  pits: string[];
  open: string[];
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

const keys = (cells: Hex[] | undefined): string[] => (cells ?? []).map(([q, r]) => keyOf(q, r));

export function createState(level: Level, limit: number = level.par + EXTRA_MOVES): State {
  return {
    radius: level.radius,
    height: Object.fromEntries(level.bumps.map(([q, r, h]) => [keyOf(q, r), h])),
    walls: keys(level.walls),
    pits: keys(level.pits),
    open: keys(level.open),
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

/**
 * その駒にとって、そのマスが何か。'block' は入れずに止まる、'fall' は入ると落ちる、'free' は普通に入れる。
 * 盤のまわりは、壁があれば止まり、壁が無ければ外へ落ちる。
 */
export function cellFor(state: State, walker: Walker, cell: string): 'block' | 'fall' | 'free' {
  const [q, r] = hexOf(cell);
  if (!inBoard(q, r, state.radius)) return state.open.includes(cell) ? 'fall' : 'block';
  if (state.walls.includes(cell)) return 'block';
  if (state.pits.includes(cell)) return 'fall';
  // 青は表を歩くので高さをそのまま、橙は裏を歩くので逆に見る。自分から見て高ければ壁、低ければ穴
  const seen = (state.height[cell] ?? 0) * (walker === 'blue' ? 1 : -1);
  return seen > 0 ? 'block' : seen < 0 ? 'fall' : 'free';
}

/** 1歩進んだ先のマス。止まるマスなら、その場に残る */
function stepOf(state: State, walker: Walker, dir: number): string {
  const [q, r] = hexOf(state[walker]);
  const [dq, dr] = DIRS[dir];
  const to = keyOf(q + dq, r + dr);
  return cellFor(state, walker, to) === 'block' ? state[walker] : to;
}

const afterMove = (state: State): State => {
  const moves = state.moves + 1;
  const done = state.blue === state.blueGoal && state.orange === state.orangeGoal;
  const status: Status = state.fell ? 'failed' : done ? 'cleared' : moves >= state.limit ? 'failed' : 'playing';
  return { ...state, moves, status };
};

/**
 * 青と橙を同時に同じ向きへ1歩動かした後の状態を新しく返す（元の状態は変えない）。
 * どちらも動けない向きなら null。落ちるマスに入った駒は落ちて、失敗になる。
 */
export function move(state: State, dir: number): State | null {
  if (state.status !== 'playing' || !DIRS[dir]) return null;
  const blue = stepOf(state, 'blue', dir), orange = stepOf(state, 'orange', dir);
  if (blue === state.blue && orange === state.orange) return null;
  const fell: Walker | null = cellFor(state, 'blue', blue) === 'fall' ? 'blue' : cellFor(state, 'orange', orange) === 'fall' ? 'orange' : null;
  return afterMove({ ...state, blue, orange, fell });
}

/**
 * マスを1段上げる（delta = 1。青のマスに近づける）か、下げる（delta = -1。橙のマスに近づける）。1手として数える。
 * 平らなマスは青か橙のマスになり、反対の色のマスは平らに戻る。
 * 駒のいるマス・ゴールのマス・壁・穴は変えられない。
 */
export function edit(state: State, cell: string, delta: 1 | -1): State | null {
  if (state.status !== 'playing' || state.editsLeft <= 0) return null;
  const [q, r] = hexOf(cell);
  if (!inBoard(q, r, state.radius)) return null;
  if ([state.blue, state.orange, state.blueGoal, state.orangeGoal, ...state.walls, ...state.pits].includes(cell)) return null;
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
