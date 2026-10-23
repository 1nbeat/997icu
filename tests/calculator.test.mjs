import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateTime } from '../app.js';

test('997 扣除每日一小时休息后为每周 77 小时', () => {
  const result = calculateTime(11, 7);
  assert.equal(result.weekly, 77);
  assert.equal(result.extra, 37);
  assert.equal(result.monthlyDays.toFixed(1), '6.7');
});
test('标准工时和较短工时不会产生负数额外时间', () => {
  assert.deepEqual(calculateTime(8, 5), { weekly: 40, extra: 0, monthlyDays: 0 });
  assert.deepEqual(calculateTime(6, 3), { weekly: 18, extra: 0, monthlyDays: 0 });
});
test('支持半小时工时和范围端点', () => {
  assert.equal(calculateTime('8.5', '5').weekly, 42.5);
  assert.equal(calculateTime(16, 7).weekly, 112);
  assert.equal(calculateTime(1, 1).weekly, 1);
});
test('无效或超范围输入被拒绝', () => {
  for (const [hours, days] of [[NaN, 5], [Infinity, 5], [0, 5], [17, 5], [8, 0], [8, 8], [8, 2.5], ['bad', 5]]) {
    assert.throws(() => calculateTime(hours, days), RangeError);
  }
});
