// このゲームの画面。盤と方向ボタンを描き、タップを「動かす・マスを変える」に直して、外枠（shell）に渡す。
import { DIRS, boardCells, dirTo, hexOf, inBoard, keyOf } from '../game/hex';
import { LEVELS } from '../game/levels';
import { createState, edit, move, starsOf, type State } from '../game/rules';
import { centerOf, hexAt, hexPath, layoutFor, type HexLayout } from './hexview';
import { t } from './i18n';
import type { Anim, GameDef } from './shell';

// 論理サイズ。上の正方形が盤、下の帯が方向ボタン
const VIEW = { width: 720, height: 920 } as const;
const BOARD = { x: 0, y: 0, width: 720, height: 720 } as const;
const PAD = { cx: 360, cy: 820, rx: 164, ry: 54, size: 46 } as const;
const COLORS = {
  bg: '#0a111b', cell: '#1c2e45', grid: '#2a4060',
  hill: '#6f8fb0', hillTop: '#a9c4de', valley: '#04070b', valleyRim: '#0e1a28',
  blue: '#4fc3f7', orange: '#ffa040', blueMark: '#1e88c8', orangeMark: '#e65100', pad: '#1c2e45', padEdge: '#3d6090', arrow: '#cfd8dc', lost: '#ef5350',
} as const;

const HINTS: [ja: string, en: string][] = [
  ['下の矢印をタップすると、青と橙が同時に同じ向きへ動く。色の輪がゴール', 'Tap an arrow: blue and orange move together. The rings are their goals'],
  ['山（明るいマス）: 青は入れずに止まる。その間に橙だけ進む。橙は山に入ると落ちる（橙の ✕）', 'Hill (bright cell): blue cannot enter and stays put while orange moves on. Orange falls if it enters (orange ✕)'],
  ['谷（暗いマス）: 橙は入れずに止まる。その間に青だけ進む。青は谷に入ると落ちる（青の ✕）', 'Valley (dark cell): orange cannot enter and stays put while blue moves on. Blue falls if it enters (blue ✕)'],
  ['「山にする」「谷にする」を選んでマスをタップすると、マスを変えられる（回数に限りあり）', 'Pick "Raise" or "Lower" and tap a cell to change it (limited uses)'],
];

// 遊び方を覚えるステージの後は、いつもこの早見を出す
const LEGEND: [ja: string, en: string] = [
  '✕ はその色の駒が落ちるマス。山: 青は止まる・橙は落ちる ／ 谷: 橙は止まる・青は落ちる',
  '✕ marks where that color falls. Hill: stops blue, drops orange / Valley: stops orange, drops blue',
];

type Tool = 'move' | 'raise' | 'lower';
let tool: Tool = 'move';
let hasEdits = false;

const layoutOf = (state: State): HexLayout => layoutFor(state.radius, BOARD);

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

function drawCells(ctx: CanvasRenderingContext2D, layout: HexLayout, state: State): void {
  for (const [q, r] of boardCells(state.radius)) {
    const { x, y } = centerOf(layout, [q, r]);
    const h = state.height[keyOf(q, r)] ?? 0;
    hexPath(ctx, x, y, layout.size, 0.96);
    ctx.fillStyle = h > 0 ? COLORS.hill : h < 0 ? COLORS.valley : COLORS.cell;
    ctx.fill();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (h !== 0) {
      hexPath(ctx, x, y, layout.size, 0.6);
      ctx.fillStyle = h > 0 ? COLORS.hillTop : COLORS.valleyRim;
      ctx.fill();
      // 入ると落ちる駒の色で ✕ を付ける（山は橙、谷は青）
      const d = layout.size * 0.2;
      ctx.beginPath();
      ctx.moveTo(x - d, y - d);
      ctx.lineTo(x + d, y + d);
      ctx.moveTo(x + d, y - d);
      ctx.lineTo(x - d, y + d);
      ctx.strokeStyle = h > 0 ? COLORS.orangeMark : COLORS.blueMark;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
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
  // 同じマスにいる時は、左右に少しずらす
  const shift = state.blue === state.orange ? layout.size * 0.28 : 0;
  const settled = !anim;
  drawWalker(ctx, layout.size, blue.x - shift, blue.y, COLORS.blue, settled && state.fell === 'blue');
  drawWalker(ctx, layout.size, orange.x + shift, orange.y, COLORS.orange, settled && state.fell === 'orange');
  drawPad(ctx);
}

export const game: GameDef<State, 'move' | 'edit'> = {
  saveKey: 'ura-omote.v1',
  title: 'URA OMOTE',
  howto: t(
    '青と橙は、同時に同じ向きへ動く。青は山で止まり、谷に落ちる。橙はその逆。2つをそれぞれの色の輪へ届けよう。',
    'Blue and orange move together. Blue is stopped by hills and falls into valleys; orange is the opposite. Bring each to the ring of its color.',
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
    return t(...(HINTS[level] ?? LEGEND));
  },
  failText: (state) =>
    state.fell === 'blue' ? t('青が谷に落ちました', 'Blue fell into a valley')
    : state.fell === 'orange' ? t('橙が山の裏側の穴に落ちました', 'Orange fell into the hollow under a hill')
    : t('手数を使い切りました', 'Out of moves'),

  buttons(state) {
    if (!hasEdits) return [];
    const none = state.editsLeft === 0;
    return [
      { id: 'move', label: t('動かす', 'Move'), selected: tool === 'move' },
      { id: 'raise', label: t(`山にする ×${state.editsLeft}`, `Raise ×${state.editsLeft}`), selected: tool === 'raise', disabled: none },
      { id: 'lower', label: t(`谷にする ×${state.editsLeft}`, `Lower ×${state.editsLeft}`), selected: tool === 'lower', disabled: none },
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
      if (y >= BOARD.height || !inBoard(q, r, state.radius)) return null;
      if (tool !== 'move') {
        const next = edit(state, keyOf(q, r), tool === 'raise' ? 1 : -1);
        if (!next) return { state, sound: 'miss' };
        if (next.editsLeft === 0) tool = 'move';
        return { state: next, sound: 'hit' };
      }
      // 「動かす」の時は、青の隣のマスをタップしても、その向きへ動く
      const toward = dirTo(hexOf(state.blue), [q, r]);
      if (toward < 0 || Math.abs(q - hexOf(state.blue)[0]) > 1 || Math.abs(r - hexOf(state.blue)[1]) > 1) return null;
      dir = toward;
    }
    const next = move(state, dir);
    if (!next) return { state, sound: 'miss' };
    return { state: next, events: 'move', ms: 130, sound: 'tap' };
  },

  draw,
};
