// Which pointer draws in the sketch editor (public/js/schizzo-puntatori.js), run as the browser runs it
// (node:vm) with the contact sizes real devices report. The owner, 17 November 2026: "da iPad non disegna
// niente" — Safari on iPad gives a touch pointer twice UITouch.majorRadius as its width and height
// (WebKit, PointerEventIOS.cpp: `m_width(2 * event.radiusXAtIndex(index))`), about 42 CSS pixels for a
// light fingertip, and the editor took every contact wider than 40 for a palm: a finger drew nothing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
  join(import.meta.dirname, '..', 'public', 'js', 'schizzo-puntatori.js'),
  'utf8',
);

// What an iPad reports for a finger (a light tap and a firm press) and the Apple Pencil; a resting palm.
const IPAD_FINGER = 41.68;
const IPAD_FINGER_FIRM = 62.52;
const PENCIL = 0.5;
const RESTING_PALM = 140;

type Pointer = {
  pointerId: number;
  pointerType: 'touch' | 'pen' | 'mouse';
  clientX: number;
  clientY: number;
  width?: number;
  height?: number;
  button?: number;
};

function editor({ lostPointers = new Set<number>() } = {}) {
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const calls: string[] = [];
  let clock = 1000;
  const canvas = {
    addEventListener: (type: string, fn: (event: unknown) => void) =>
      listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    // A pointer already gone: the browser throws NotFoundError.
    setPointerCapture: (id: number) => {
      if (lostPointers.has(id)) throw new Error('NotFoundError');
    },
  };
  const vista = {
    toSheet: (x: number, y: number) => ({ x, y }),
    pinchStart: () => calls.push('pinchStart'),
    pinchMove: () => calls.push('pinchMove'),
    pinchEnd: () => calls.push('pinchEnd'),
    panBy: (dx: number, dy: number) => calls.push(`pan ${dx} ${dy}`),
  };
  const tool = {
    down: (p: { x: number; y: number }) => calls.push(`down ${p.x} ${p.y}`),
    move: (p: { x: number; y: number }) => calls.push(`move ${p.x} ${p.y}`),
    up: (p: { x: number; y: number }) => calls.push(`up ${p.x} ${p.y}`),
    cancel: () => calls.push('cancel'),
  };
  const ed = {
    canvas,
    vista,
    tool,
    spaceHeld: false,
    pointerType: 'mouse',
    TOLERANCES: { touch: {}, pen: {}, mouse: {} },
  };
  vm.runInNewContext(source, {
    window: { rilieviSchizzoEditor: ed },
    performance: { now: () => clock },
  });
  const send = (type: string, pointer: Pointer) => {
    const event = {
      type,
      width: 1,
      height: 1,
      button: 0,
      ...pointer,
      preventDefault: () => {},
    };
    (listeners.get(type) ?? []).forEach((fn) => fn(event));
  };
  /** A finger, pen or mouse put down, moved by 10 in x and let go. */
  const stroke = (pointer: Pointer) => {
    send('pointerdown', pointer);
    send('pointermove', { ...pointer, clientX: pointer.clientX + 10 });
    send('pointerup', { ...pointer, clientX: pointer.clientX + 10 });
  };
  return {
    ed,
    calls,
    send,
    stroke,
    later: (ms: number) => {
      clock += ms;
    },
  };
}

const finger = (id: number, size: number, x = 100, y = 100): Pointer => ({
  pointerId: id,
  pointerType: 'touch',
  clientX: x,
  clientY: y,
  width: size,
  height: size,
});
const pencil = (id: number, x = 300, y = 300): Pointer => ({
  pointerId: id,
  pointerType: 'pen',
  clientX: x,
  clientY: y,
  width: PENCIL,
  height: PENCIL,
});

describe('the pointers of the sketch editor', () => {
  it('draws with a finger on an iPad — a light tap and a firm press alike', () => {
    for (const size of [IPAD_FINGER, IPAD_FINGER_FIRM]) {
      const { calls, stroke, ed } = editor();
      stroke(finger(1, size));
      assert.deepEqual(calls, ['down 100 100', 'move 110 100', 'up 110 100'], `width ${size}`);
      assert.equal(ed.pointerType, 'touch');
    }
  });

  it('draws with the Apple Pencil', () => {
    const { calls, stroke, ed } = editor();
    stroke(pencil(7));
    assert.deepEqual(calls, ['down 300 300', 'move 310 300', 'up 310 300']);
    assert.equal(ed.pointerType, 'pen');
  });

  it('pinches the view with two iPad fingers and undoes what the first one started', () => {
    const { calls, send } = editor();
    send('pointerdown', finger(1, IPAD_FINGER, 100, 100));
    send('pointerdown', finger(2, IPAD_FINGER, 200, 200));
    send('pointermove', finger(2, IPAD_FINGER, 220, 220));
    send('pointerup', finger(1, IPAD_FINGER, 100, 100));
    send('pointerup', finger(2, IPAD_FINGER, 220, 220));
    // pinchEnd on each finger let go (it only drops the pinch); nothing draws in between.
    assert.deepEqual(calls, [
      'down 100 100',
      'cancel',
      'pinchStart',
      'pinchMove',
      'pinchEnd',
      'pinchEnd',
    ]);
  });

  it('draws again with one finger once both fingers of a pinch are up', () => {
    const { calls, send, stroke } = editor();
    send('pointerdown', finger(1, IPAD_FINGER, 100, 100));
    send('pointerdown', finger(2, IPAD_FINGER, 200, 200));
    send('pointerup', finger(1, IPAD_FINGER, 100, 100));
    send('pointerdown', finger(3, IPAD_FINGER, 150, 150));
    send('pointerup', finger(3, IPAD_FINGER, 150, 150));
    send('pointerup', finger(2, IPAD_FINGER, 200, 200));
    calls.length = 0;
    stroke(finger(4, IPAD_FINGER, 50, 60));
    assert.deepEqual(calls, ['down 50 60', 'move 60 60', 'up 60 60']);
  });

  it('once the Pencil has drawn, a finger moves the view and does not draw', () => {
    const { calls, stroke, send, later } = editor();
    stroke(pencil(7));
    calls.length = 0;
    later(1000);
    send('pointerdown', finger(1, IPAD_FINGER));
    send('pointermove', finger(1, IPAD_FINGER, 130, 110));
    send('pointerup', finger(1, IPAD_FINGER, 130, 110));
    assert.deepEqual(calls, ['pan 30 10']);
  });

  it('ignores the hand while the Pencil is down and just after it', () => {
    const { calls, stroke, send, later } = editor();
    send('pointerdown', pencil(7));
    stroke(finger(1, IPAD_FINGER));
    send('pointerup', pencil(7));
    later(200);
    stroke(finger(2, IPAD_FINGER));
    assert.deepEqual(calls, ['down 300 300', 'up 300 300']);
  });

  it('never takes a palm for a finger, before the Pencil too', () => {
    const { calls, stroke } = editor();
    stroke(finger(1, RESTING_PALM));
    assert.deepEqual(calls, []);
  });

  it('takes a contact up to 100 CSS pixels for a finger, a wider one for a palm', () => {
    const atLimit = editor();
    atLimit.stroke(finger(1, 100));
    assert.deepEqual(atLimit.calls, ['down 100 100', 'move 110 100', 'up 110 100']);
    const over = editor();
    over.stroke(finger(1, 101));
    assert.deepEqual(over.calls, []);
  });

  it('drops what a finger resting before the Pencil began, and the Pencil draws', () => {
    const { calls, send } = editor();
    send('pointerdown', finger(1, IPAD_FINGER, 100, 100));
    send('pointermove', finger(1, IPAD_FINGER, 120, 100));
    send('pointerdown', pencil(7));
    send('pointermove', { ...pencil(7), clientX: 310 });
    send('pointermove', finger(1, IPAD_FINGER, 140, 100));
    send('pointerup', finger(1, IPAD_FINGER, 140, 100));
    send('pointerup', { ...pencil(7), clientX: 310 });
    assert.deepEqual(calls, [
      'down 100 100',
      'move 120 100',
      'cancel',
      'down 300 300',
      'move 310 300',
      'up 310 300',
    ]);
  });

  it('ends a pinch of the hand when the Pencil comes down, and the Pencil draws', () => {
    const { calls, send } = editor();
    send('pointerdown', finger(1, IPAD_FINGER, 100, 100));
    send('pointerdown', finger(2, IPAD_FINGER, 200, 200));
    send('pointerdown', pencil(7));
    send('pointerup', pencil(7));
    send('pointerup', finger(1, IPAD_FINGER, 100, 100));
    send('pointerup', finger(2, IPAD_FINGER, 200, 200));
    assert.deepEqual(calls, [
      'down 100 100',
      'cancel',
      'pinchStart',
      'pinchEnd',
      'down 300 300',
      'up 300 300',
    ]);
  });

  it('holds nothing for a pointer the browser can no longer capture', () => {
    const { calls, send, stroke } = editor({ lostPointers: new Set([1]) });
    send('pointerdown', finger(1, IPAD_FINGER));
    stroke(finger(2, IPAD_FINGER, 50, 60));
    assert.deepEqual(calls, ['down 50 60', 'move 60 60', 'up 60 60']);
  });

  it('a Pencil the browser can no longer capture does not leave the fingers off', () => {
    const { calls, send, stroke, later } = editor({ lostPointers: new Set([7]) });
    send('pointerdown', pencil(7));
    later(1000);
    stroke(finger(1, IPAD_FINGER, 50, 60));
    assert.deepEqual(calls, ['down 50 60', 'move 60 60', 'up 60 60']);
  });

  it('a second pointer takes the tool over and drops the first one’s stroke, never half way', () => {
    const { calls, send } = editor();
    const mouse: Pointer = { pointerId: 9, pointerType: 'mouse', clientX: 10, clientY: 10 };
    send('pointerdown', mouse);
    send('pointermove', { ...mouse, clientX: 20 });
    send('pointerdown', finger(1, IPAD_FINGER, 100, 100));
    send('pointermove', { ...mouse, clientX: 30 });
    send('pointerup', { ...mouse, clientX: 30 });
    send('pointerup', finger(1, IPAD_FINGER, 100, 100));
    assert.deepEqual(calls, ['down 10 10', 'move 20 10', 'cancel', 'down 100 100', 'up 100 100']);
  });

  it('once the Pencil has drawn, a resting palm does not move the view', () => {
    const { calls, stroke, later } = editor();
    stroke(pencil(7));
    calls.length = 0;
    later(1000);
    stroke(finger(1, RESTING_PALM));
    assert.deepEqual(calls, []);
  });
});
