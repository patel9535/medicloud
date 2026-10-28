import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const signature = (value) => createHmac('sha256', config.jwtSecret).update(value).digest();

export function createAccessToken(userId) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: userId, iss: 'medicloud-api', aud: 'medicloud-web', iat: now, exp: now + 900 });
  const content = `${header}.${payload}`;
  return `${content}.${signature(content).toString('base64url')}`;
}

export function readAccessToken(token) {
  if (token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;
  try {
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
    const expected = signature(`${headerPart}.${payloadPart}`);
    const actual = Buffer.from(signaturePart, 'base64url');
    if (actual.toString('base64url') !== signaturePart || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    if (typeof payload.sub !== 'string' || payload.iss !== 'medicloud-api' || payload.aud !== 'medicloud-web' || !Number.isInteger(payload.exp) || payload.exp <= Date.now() / 1000) return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}
