// 総当たりで最少の手数を求める。ステージの確認と、ステージ作りに使う。
import { boardCells, keyOf } from './hex';
import { createState, edit, move, type Level, type State } from './rules';

export type Action = { type: 'move'; dir: number } | { type: 'edit'; cell: string; delta: 1 | -1 };

export function apply(state: State, action: Action): State | null {
  return action.type === 'move' ? move(state, action.dir) : edit(state, action.cell, action.delta);
}

const stateKey = (s: State): string =>
  `${s.blue}|${s.orange}|${s.editsLeft}|${Object.keys(s.height).sort().map((k) => `${k}=${s.height[k]}`).join(';')}`;

/** 最少の手数でクリアする手順。maxMoves 手までで届かなければ null */
export function solve(level: Level, maxMoves: number = 16): Action[] | null {
  const start = createState(level, Infinity);
  if (start.blue === start.blueGoal && start.orange === start.orangeGoal) return [];
  const cells = boardCells(level.radius).map(([q, r]) => keyOf(q, r));

  // 幅優先。同じ盤面は、最初に着いた時の手順だけ覚える
  let layer: { state: State; path: Action[] }[] = [{ state: start, path: [] }];
  const seen = new Set([stateKey(start)]);

  for (let depth = 1; depth <= maxMoves && layer.length > 0; depth++) {
    const next: { state: State; path: Action[] }[] = [];
    for (const node of layer) {
      const actions: Action[] = [0, 1, 2, 3, 4, 5].map((dir) => ({ type: 'move', dir }));
      if (node.state.editsLeft > 0) {
        for (const cell of cells) actions.push({ type: 'edit', cell, delta: 1 }, { type: 'edit', cell, delta: -1 });
      }
      for (const action of actions) {
        const state = apply(node.state, action);
        if (!state || state.status === 'failed') continue;
        if (state.status === 'cleared') return [...node.path, action];
        const key = stateKey(state);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ state, path: [...node.path, action] });
      }
    }
    layer = next;
  }
  return null;
}
