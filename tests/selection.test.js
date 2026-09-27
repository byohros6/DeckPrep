import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRange } from '../src/renderer/selection.js';

test('Shift range follows the order of shown rows and the anchor selection', () => {
  const visible = [1, 3, 5, 8].map(index => ({ index, selected: index === 3 }));
  assert.equal(selectRange(visible, 3, 8, true), true);
  assert.deepEqual(visible.map(track => track.selected), [false, true, true, true]);
  assert.equal(selectRange(visible, 8, 3, false), true);
  assert.deepEqual(visible.map(track => track.selected), [false, false, false, false]);
});

test('a hidden anchor does not change any shown row', () => {
  const visible = [{ index: 4, selected: false }, { index: 7, selected: false }];
  assert.equal(selectRange(visible, 1, 7, true), false);
  assert.equal(visible.every(track => !track.selected), true);
});
