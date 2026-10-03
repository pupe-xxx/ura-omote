import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/game/levels';
import { createState, edit, move, starsOf, type Level } from '../src/game/rules';
import { apply, solve } from '../src/game/solve';

const level = (over: Partial<Level>): Level => ({
  radius: 2, bumps: [], blue: [-1, 0], orange: [-1, 1], blueGoal: [2, 0], orangeGoal: [1, 1], edits: 0, par: 3, ...over,
});
const EAST = 0, WEST = 3;

describe('動かす', () => {
  it('青と橙は、同時に同じ向きへ1歩動く。元の状態は変わらない', () => {
    const s = createState(level({}));
    const next = move(s, EAST)!;
    expect(next.blue).toBe('0,0');
    expect(next.orange).toBe('0,1');
    expect(next.moves).toBe(1);
    expect(s.blue).toBe('-1,0');
  });

  it('青は山で止まり、橙だけが進む', () => {
    const s = createState(level({ bumps: [[0, 0, 1]] }));
    const next = move(s, EAST)!;
    expect(next.blue).toBe('-1,0');
    expect(next.orange).toBe('0,1');
  });

  it('橙は谷で止まり、青だけが進む', () => {
    const s = createState(level({ bumps: [[0, 1, -1]] }));
    const next = move(s, EAST)!;
    expect(next.blue).toBe('0,0');
    expect(next.orange).toBe('-1,1');
  });

  it('青が谷に入ると落ちて失敗になる', () => {
    const next = move(createState(level({ bumps: [[0, 0, -1]] })), EAST)!;
    expect(next.status).toBe('failed');
    expect(next.fell).toBe('blue');
  });

  it('橙が山に入ると落ちて失敗になる', () => {
    const next = move(createState(level({ bumps: [[0, 1, 1]] })), EAST)!;
    expect(next.status).toBe('failed');
    expect(next.fell).toBe('orange');
  });

  it('盤の端では止まる。どちらも動けない向きは手にならない', () => {
    const s = createState(level({ blue: [-2, 0], orange: [-2, 1] }));
    expect(move(s, WEST)).toBeNull();
  });

  it('2つとも自分のゴールに着くとクリア。片方だけでは続く', () => {
    let s = createState(level({ bumps: [[1, 1, -1]], blueGoal: [1, 0], orangeGoal: [0, 1], par: 2 }));
    s = move(s, EAST)!;
    expect(s.status).toBe('playing'); // 橙だけ着いた
    s = move(s, EAST)!; // 橙は谷で止まり、青が着く
    expect(s.status).toBe('cleared');
    expect(starsOf(s)).toBe(3);
  });

  it('手数を使い切ると失敗になる', () => {
    let s = createState(level({}), 2);
    s = move(s, EAST)!;
    s = move(s, WEST)!;
    expect(s.status).toBe('failed');
    expect(s.fell).toBeNull();
    expect(move(s, EAST)).toBeNull();
  });
});

describe('マスを変える', () => {
  it('平らなマスを山にでき、1手として数える。回数が減る', () => {
    const s = createState(level({ edits: 1 }));
    const next = edit(s, '0,0', 1)!;
    expect(next.height).toEqual({ '0,0': 1 });
    expect(next.editsLeft).toBe(0);
    expect(next.moves).toBe(1);
    expect(edit(next, '1,0', 1)).toBeNull();
  });

  it('山を下げると平らに戻る。山より上、谷より下にはならない', () => {
    const s = createState(level({ bumps: [[0, 0, 1], [0, -1, -1]], edits: 3 }));
    expect(edit(s, '0,0', -1)!.height).toEqual({ '0,-1': -1 });
    expect(edit(s, '0,0', 1)).toBeNull();
    expect(edit(s, '0,-1', -1)).toBeNull();
  });

  it('駒のいるマス・ゴールのマス・盤の外は変えられない', () => {
    const s = createState(level({ edits: 1 }));
    expect(edit(s, '-1,0', 1)).toBeNull();
    expect(edit(s, '-1,1', 1)).toBeNull();
    expect(edit(s, '2,0', 1)).toBeNull();
    expect(edit(s, '1,1', -1)).toBeNull();
    expect(edit(s, '3,0', 1)).toBeNull();
  });
});

describe('星', () => {
  it('最少の手数なら3つ、2手多くまでは2つ、それより多いと1つ', () => {
    const s = createState(level({ par: 5 }));
    expect(starsOf({ ...s, status: 'cleared', moves: 5 })).toBe(3);
    expect(starsOf({ ...s, status: 'cleared', moves: 7 })).toBe(2);
    expect(starsOf({ ...s, status: 'cleared', moves: 8 })).toBe(1);
    expect(starsOf({ ...s, status: 'failed', moves: 5 })).toBe(0);
  });
});

describe('ステージ', () => {
  it('20 ステージ以上ある', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(20);
  });

  it('どのステージも解けて、par が最少の手数と合っている', () => {
    LEVELS.forEach((l, i) => {
      const best = solve(l, l.par);
      expect(best?.length, `ステージ ${i + 1}`).toBe(l.par);
      // 求めた手順を順に打つと、本当にクリアになる
      let s = createState(l);
      for (const action of best ?? []) s = apply(s, action)!;
      expect(s.status, `ステージ ${i + 1}`).toBe('cleared');
    });
  }, 60000);

  it('駒とゴールは平らなマスにある', () => {
    LEVELS.forEach((l, i) => {
      const bumps = new Set(l.bumps.map(([q, r]) => `${q},${r}`));
      for (const [q, r] of [l.blue, l.orange, l.blueGoal, l.orangeGoal]) expect(bumps.has(`${q},${r}`), `ステージ ${i + 1}`).toBe(false);
    });
  });
});
