import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequestGate } from '../src/lib/latestRequest.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('a late anonymous response cannot replace authenticated data or dismiss its loader', async () => {
  const gate = createRequestGate();
  let view = 'loading';
  const oldResponse = deferred<string>();
  const old = gate.start();
  const oldLoad = oldResponse.promise.then(value => { if (old.isCurrent()) view = value; }).finally(() => { if (old.isCurrent()) view += ':ready'; });
  const signedIn = gate.start();
  assert(old.signal.aborted);
  oldResponse.resolve('anonymous home');
  await oldLoad;
  assert.equal(view, 'loading');
  assert(signedIn.isCurrent());
});

test('signing out prevents a pending private response from restoring the previous account', async () => {
  const gate = createRequestGate();
  const privateLoad = gate.start();
  gate.cancel();
  assert(privateLoad.signal.aborted);
  assert(!privateLoad.isCurrent());
  const guest = gate.start();
  assert(guest.isCurrent());
  assert(!privateLoad.isCurrent());
});

test('a request timeout remains current so the view can display an error and retry', () => {
  const gate = createRequestGate();
  const timedOut = gate.start();
  timedOut.abort();
  assert(timedOut.signal.aborted);
  assert(timedOut.isCurrent());
  const retry = gate.start();
  assert(!timedOut.isCurrent());
  assert(retry.isCurrent());
  assert(!retry.signal.aborted);
});

test('an old request failure cannot replace the result of a successful retry', async () => {
  const gate = createRequestGate();
  const failure = deferred<string>();
  const old = gate.start();
  let view = 'loading';
  const pending = failure.promise.catch(() => { if (old.isCurrent()) view = 'error'; });
  const retry = gate.start();
  if (retry.isCurrent()) view = 'workspace';
  failure.reject(new Error('Late network error'));
  await pending;
  assert.equal(view, 'workspace');
  gate.cancel();
  assert(!retry.isCurrent());
});
