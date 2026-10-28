import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessToken, readAccessToken } from './tokens.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { requireRole } from './middleware.js';

test('access tokens contain only the user identity and validate their signature', () => {
  const token = createAccessToken('synthetic-user-id');
  assert.deepEqual(readAccessToken(token), { userId: 'synthetic-user-id' });
  assert.equal(readAccessToken('malformed.token'), null);
  const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
  assert.equal(readAccessToken(tampered), null);
});

test('password hashes verify correctly without storing the password', async () => {
  const password = 'SyntheticDemoPassword2026!';
  const hash = await hashPassword(password);
  assert.notEqual(hash, password);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('incorrect-password', hash), false);
});

test('role middleware rejects missing and mismatched roles, and permits allowed roles', () => {
  const response = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let continued = false;
  const next = () => { continued = true; };

  requireRole('ADMIN')({}, response, next);
  assert.equal(response.statusCode, 401);
  assert.equal(continued, false);

  response.statusCode = 200;
  requireRole('ADMIN')({ user: { role: 'PATIENT' } }, response, next);
  assert.equal(response.statusCode, 403);
  assert.equal(continued, false);

  requireRole('ADMIN')({ user: { role: 'ADMIN' } }, response, next);
  assert.equal(continued, true);
});
