// このゲームの画面。盤と方向ボタンを描き、タップを「動かす・マスを変える」に直して、外枠（shell）に渡す。
import { DIRS, boardCells, dirTo, hexDist, hexOf, inBoard, keyOf, rimCells } from '../game/hex';
import { LEVELS } from '../game/levels';
import { createState, edit, move, starsOf, type Level, type State } from '../game/rules';
import { centerOf, hexAt, hexPath, layoutFor, type HexLayout } from './hexview';
import { t } from './i18n';
import type { Anim, GameDef } from './shell';

// 論理サイズ。上の正方形が盤、下の帯が方向ボタン
const VIEW = { width: 720, height: 920 } as const;
const BOARD = { x: 0, y: 0, width: 720, height: 720 } as const;
const PAD = { cx: 360, cy: 820, rx: 164, ry: 54, size: 46 } as const;
const COLORS = {
  bg: '#0a111b', cell: '#1c2e45', grid: '#2a4060',
  // マスの色は、そのマスで「止まれる」駒の色。違う色の駒が入ると落ちる
  blueCell: '#1d5d8c', blueTop: '#4aa3d6', orangeCell: '#8c4f17', orangeTop: '#dd8a34',
  wall: '#546e7a', wallTop: '#8799a3', rim: '#3b4d57', rimTop: '#56666f', pit: '#020305', pitTop: '#000000', pitEdge: '#5c2323',
  blue: '#4fc3f7', orange: '#ffa040', pad: '#1c2e45', padEdge: '#3d6090', arrow: '#cfd8dc', lost: '#ef5350',
} as const;

const TIPS: Record<NonNullable<Level['tip']>, [ja: string, en: string]> = {
  move: ['下の矢印をタップすると、青と橙が同時に同じ向きへ動く。色の輪がゴール。まわりの灰色は壁', 'Tap an arrow: blue and orange move together. The rings are their goals. The gray rim is a wall'],
  blue: ['青いマス: 青には壁（止まる）。その間に橙だけ進む。橙が入ると落ちる', 'Blue cell: a wall for blue, which stays put while orange moves on. Orange falls if it enters'],
  orange: ['橙のマス: 橙には壁（止まる）。その間に青だけ進む。青が入ると落ちる', 'Orange cell: a wall for orange, which stays put while blue moves on. Blue falls if it enters'],
  edit: ['「青にする」「橙にする」を選んでマスをタップすると、マスの色を変えられる（回数に限りあり）', 'Pick "Blue" or "Orange" and tap a cell to change its color (limited uses)'],
  wall: ['灰色のマスは、2つとも止まる壁。黒いマスは、2つとも落ちる穴', 'A gray cell is a wall that stops both. A black cell is a pit that drops both'],
  edge: ['まわりの壁が無い所は、外へ出ると落ちる', 'Where the rim wall is missing, stepping outside drops you'],
};

// 遊び方を覚えるステージの後は、いつもこの早見を出す
const LEGEND: [ja: string, en: string] = [
  '同じ色のマスと相手の駒は壁（止まる）。違う色のマスは落ちる。灰色は2つとも止まり、黒は2つとも落ちる',
  'Your own color and the other piece are walls (you stop). The other color drops you. Gray stops both, black drops both',
];

type Tool = 'move' | 'raise' | 'lower';
let tool: Tool = 'move';
let hasEdits = false;

// まわりの壁まで収まるように、盤より1回り広く取る
const layoutOf = (state: State): HexLayout => layoutFor(state.radius + 1, BOARD);

/** 方向ボタンの中心。盤の上での向きと同じ並びにする */
function padCenter(dir: number): { x: number; y: number } {
  const [dq, dr] = DIRS[dir];
  return { x: PAD.cx + PAD.rx * (dq + dr / 2), y: PAD.cy + PAD.ry * dr };
}

function drawPad(ctx: CanvasRenderingContext2D): void {
  for (let dir = 0; dir < 6; dir++) {
    const { x, y } = padCenter(dir);
    hexPath(ctx, x, y, PAD.size);
    ctx.fillStyle = COLORS.pad;
    ctx.fill();
    ctx.strokeStyle = COLORS.padEdge;
    ctx.lineWidth = 3;
    ctx.stroke();
    // 矢印。盤の上で進む向きに合わせて回す
    const [dq, dr] = DIRS[dir];
    const angle = Math.atan2(1.5 * dr, Math.sqrt(3) * (dq + dr / 2));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    // 細長い矢じり。正三角形に近いと、回しても向きが見分けられない
    ctx.moveTo(26, 0);
    ctx.lineTo(-14, -12);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-14, 12);
    ctx.closePath();
    ctx.fillStyle = COLORS.arrow;
    ctx.fill();
    ctx.restore();
  }
}

/** 2色で塗った六角形。外側と、少し小さい内側 */
function drawBlock(ctx: CanvasRenderingContext2D, layout: HexLayout, cell: string, outer: string, inner: string): void {
  const { x, y } = centerOf(layout, hexOf(cell));
  hexPath(ctx, x, y, layout.size, 0.96);
  ctx.fillStyle = outer;
  ctx.fill();
  hexPath(ctx, x, y, layout.size, 0.6);
  ctx.fillStyle = inner;
  ctx.fill();
}

function drawCells(ctx: CanvasRenderingContext2D, layout: HexLayout, state: State): void {
  // まわりの壁。無い所は何も描かない（そこから外へ落ちる）
  for (const [q, r] of rimCells(state.radius)) {
    if (!state.open.includes(keyOf(q, r))) drawBlock(ctx, layout, keyOf(q, r), COLORS.rim, COLORS.rimTop);
  }
  for (const [q, r] of boardCells(state.radius)) {
    const { x, y } = centerOf(layout, [q, r]);
    hexPath(ctx, x, y, layout.size, 0.96);
    ctx.fillStyle = COLORS.cell;
    ctx.fill();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  for (const [cell, h] of Object.entries(state.height)) {
    if (h > 0) drawBlock(ctx, layout, cell, COLORS.blueCell, COLORS.blueTop);
    else drawBlock(ctx, layout, cell, COLORS.orangeCell, COLORS.orangeTop);
  }
  for (const cell of state.walls) drawBlock(ctx, layout, cell, COLORS.wall, COLORS.wallTop);
  for (const cell of state.pits) {
    drawBlock(ctx, layout, cell, COLORS.pit, COLORS.pitTop);
    const { x, y } = centerOf(layout, hexOf(cell));
    hexPath(ctx, x, y, layout.size, 0.9);
    ctx.strokeStyle = COLORS.pitEdge;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
}

function drawGoal(ctx: CanvasRenderingContext2D, layout: HexLayout, cell: string, color: string, inner: boolean): void {
  const { x, y } = centerOf(layout, hexOf(cell));
  ctx.beginPath();
  ctx.arc(x, y, layout.size * (inner ? 0.5 : 0.7), 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.setLineDash([10, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawWalker(ctx: CanvasRenderingContext2D, size: number, x: number, y: number, color: string, lost: boolean): void {
  ctx.beginPath();
  ctx.arc(x, y, size * (lost ? 0.22 : 0.36), 0, Math.PI * 2);
  ctx.fillStyle = lost ? COLORS.lost : color;
  ctx.fill();
  ctx.strokeStyle = COLORS.bg;
  ctx.lineWidth = 4;
  ctx.stroke();
}

function draw(ctx: CanvasRenderingContext2D, state: State, anim: Anim<State, 'move' | 'edit'> | null): void {
  const layout = layoutOf(state);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  drawCells(ctx, layout, state);
  // 2つのゴールが同じマスでも両方見えるように、橙の輪は内側に描く
  drawGoal(ctx, layout, state.blueGoal, COLORS.blue, false);
  drawGoal(ctx, layout, state.orangeGoal, COLORS.orange, true);

  // 動きを見せている間は、動く前の位置から後の位置へ滑らせる
  const place = (now: string, before: string | undefined) => {
    const to = centerOf(layout, hexOf(now));
    if (!anim || before === undefined) return to;
    const from = centerOf(layout, hexOf(before));
    return { x: from.x + (to.x - from.x) * anim.t, y: from.y + (to.y - from.y) * anim.t };
  };
  const blue = place(state.blue, anim?.from.blue), orange = place(state.orange, anim?.from.orange);
  const settled = !anim;
  drawWalker(ctx, layout.size, blue.x, blue.y, COLORS.blue, settled && state.fell === 'blue');
  drawWalker(ctx, layout.size, orange.x, orange.y, COLORS.orange, settled && state.fell === 'orange');
  drawPad(ctx);
}

export const game: GameDef<State, 'move' | 'edit'> = {
  saveKey: 'ura-omote.v1',
  title: 'URA OMOTE',
  howto: t(
    '青と橙は、同時に同じ向きへ動く。同じ色のマスは壁になって止まり、違う色のマスに入ると落ちる。2つをそれぞれの色の輪へ届けよう。',
    'Blue and orange move together. A cell of your own color is a wall; a cell of the other color drops you. Bring each to the ring of its color.',
  ),
  view: VIEW,
  levelCount: LEVELS.length,

  start(level) {
    tool = 'move';
    hasEdits = LEVELS[level].edits > 0;
    return createState(LEVELS[level]);
  },
  status: (state) => state.status,
  stars: starsOf,
  counter: (state) => {
    const left = state.limit - state.moves;
    return t(`残り ${left} 手（★3 は ${state.par} 手）`, `${left} moves left (★3: ${state.par})`);
  },
  hint: (level) => {
    const tip = LEVELS[level].tip;
    return t(...(tip ? TIPS[tip] : LEGEND));
  },
  failText: (state) =>
    state.fell === 'blue' ? t('青が落ちました', 'Blue fell')
    : state.fell === 'orange' ? t('橙が落ちました', 'Orange fell')
    : t('手数を使い切りました', 'Out of moves'),

  buttons(state) {
    if (!hasEdits) return [];
    const none = state.editsLeft === 0;
    return [
      { id: 'move', label: t('動かす', 'Move'), selected: tool === 'move' },
      { id: 'raise', label: t(`青にする ×${state.editsLeft}`, `Blue ×${state.editsLeft}`), selected: tool === 'raise', disabled: none },
      { id: 'lower', label: t(`橙にする ×${state.editsLeft}`, `Orange ×${state.editsLeft}`), selected: tool === 'lower', disabled: none },
    ];
  },
  press(state, id) {
    tool = state.editsLeft > 0 && (id === 'raise' || id === 'lower') ? id : 'move';
    return { state, sound: 'tap' };
  },

  tap(state, x, y) {
    let dir = [0, 1, 2, 3, 4, 5].find((d) => {
      const c = padCenter(d);
      return Math.hypot(x - c.x, y - c.y) <= PAD.size;
    });
    if (dir === undefined) {
      const [q, r] = hexAt(layoutOf(state), x, y);
      if (y >= BOARD.height || !inBoard(q, r, state.radius + 1)) return null;
      if (tool !== 'move') {
        const next = edit(state, keyOf(q, r), tool === 'raise' ? 1 : -1);
        if (!next) return { state, sound: 'miss' };
        if (next.editsLeft === 0) tool = 'move';
        return { state: next, sound: 'hit' };
      }
      // 「動かす」の時は、青の隣のマスをタップしても、その向きへ動く
      if (hexDist(hexOf(state.blue), [q, r]) !== 1) return null;
      dir = dirTo(hexOf(state.blue), [q, r]);
    }
    const next = move(state, dir);
    if (!next) return { state, sound: 'miss' };
    return { state: next, events: 'move', ms: 130, sound: 'tap' };
  },

  draw,
};
