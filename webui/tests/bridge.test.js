import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridge } from '../src/bridge.js';

test('request preserves Cyrillic and routes a native reply by ID', async () => {
  let outgoing;
  const bridge = createBridge(text => { outgoing = JSON.parse(text); });
  const result = bridge.request('Client.Command', { text: '/veh 411', label: 'Машина' });
  assert.deepEqual(outgoing, { v: 1, id: 1, event: 'Client.Command', args: [{ text: '/veh 411', label: 'Машина' }] });
  assert.equal(bridge.receive({ replyTo: 99, ok: true }), false);
  assert.equal(bridge.receive({ replyTo: 1, ok: true, result: { sent: true } }), true);
  assert.deepEqual(await result, { sent: true });
});
test('events unsubscribe independently and malformed input is ignored', () => {
  const bridge = createBridge(() => {}); const values = [];
  const off = bridge.on('State', value => values.push(value));
  assert.equal(bridge.receive('{bad'), false);
  assert.equal(bridge.receive({ event: 'State', args: {} }), false);
  bridge.receive(JSON.stringify({ event: 'State', args: [{ health: 42 }] }));
  off(); bridge.receive({ event: 'State', args: [{ health: 99 }] });
  assert.deepEqual(values, [{ health: 42 }]);
});
test('native errors, timeout, lifecycle reset and transport errors reject requests', async () => {
  let timer;
  const bridge = createBridge(() => {}, { schedule: fn => { timer = fn; return 7; }, cancel: () => {} });
  const rejected = bridge.request('Client.Command', { text: '/spawn' });
  bridge.receive({ replyTo: 1, ok: false, error: 'Нет подключения' });
  await assert.rejects(rejected, /Нет подключения/);
  const expired = bridge.request('Ui.Ping'); timer();
  await assert.rejects(expired, /Игра не ответила/);
  const paused = bridge.request('Ui.Ping'); bridge.reset();
  await assert.rejects(paused, /закрыто/);
  const failed = createBridge(() => { throw new Error('Transport unavailable'); });
  await assert.rejects(failed.request('Ui.Ping'), /Transport unavailable/);
});
test('request can receive a synchronous reply and limits UTF-8 payload size', async () => {
  let bridge;
  bridge = createBridge(text => bridge.receive({ replyTo: JSON.parse(text).id, ok: true, result: 123 }));
  assert.equal(await bridge.request('Ui.Ping'), 123);
  await assert.rejects(bridge.request('bad event'), /событие/);
  await assert.rejects(bridge.request('Client.Chat', { text: 'Я'.repeat(9000) }), /большое/);
});
