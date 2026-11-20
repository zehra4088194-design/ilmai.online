import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { constantTimeEqual, hmacSha256, verifyRequest } from '../workers/ai-router/src/security';

describe('Cloudflare AI router request authentication', () => {
  it('validates short-lived HMAC signatures', async () => {
    const secret = 'router-test-secret';
    const timestamp = String(Date.now());
    const nonce = '12345678-1234-4123-8123-123456789abc';
    const method = 'POST';
    const pathname = '/v1/chat/completions';
    const body = '{"model":"test/model"}';
    const signature = await hmacSha256(secret, [timestamp,nonce,method,pathname,body].join('.'));
    assert.equal(await verifyRequest({ secret,timestamp,nonce,method,pathname,body,signature }), true);
  });
  it('rejects expired requests, path swaps and signature mutations', async () => {
    const secret = 'router-test-secret';
    const timestamp = String(Date.now() - 120_000);
    const nonce = '12345678-1234-4123-8123-123456789abc';
    const signature = await hmacSha256(secret, [timestamp,nonce,'POST','/v1/chat/completions','{}'].join('.'));
    assert.equal(await verifyRequest({ secret,timestamp,nonce,method:'POST',pathname:'/v1/chat/completions',body:'{}',signature }), false);
    assert.equal(await verifyRequest({ secret,timestamp:String(Date.now()),nonce,method:'GET',pathname:'/health',body:'{}',signature }), false);
    assert.equal(constantTimeEqual('abcd','abce'), false);
  });
});
