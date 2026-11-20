import test from 'node:test';
import assert from 'node:assert/strict';
import { authorized, isSafeHtml } from './server.js';

test('renderer compares the bearer secret and rejects missing credentials', () => {
  assert.equal(authorized('Bearer secret-value', 'secret-value'), true);
  assert.equal(authorized('Bearer wrong-value', 'secret-value'), false);
  assert.equal(authorized(undefined, 'secret-value'), false);
  assert.equal(authorized('Bearer secret-value', ''), false);
});

test('renderer accepts a static document without active content', () => {
  assert.equal(isSafeHtml('<!doctype html><html><head></head><body><h1>Exam</h1></body></html>'), true);
});

test('renderer rejects scripts, event handlers, remote resources and oversized input', () => {
  assert.equal(isSafeHtml('<html><body><script>alert(1)</script></body></html>'), false);
  assert.equal(isSafeHtml('<html><body><img src=x onerror=alert(1)></body></html>'), false);
  assert.equal(isSafeHtml('<html><body><style>body{background:url(https://evil.test/x)}</style></body></html>'), false);
  assert.equal(isSafeHtml('<html><body>' + 'a'.repeat(3 * 1024 * 1024 + 10) + '</body></html>'), false);
});
