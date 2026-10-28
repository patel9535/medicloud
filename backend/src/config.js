import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port.');
}

const jwtSecret = process.env.JWT_SECRET?.trim() || (process.env.NODE_ENV === 'production'
  ? ''
  : randomBytes(32).toString('base64url'));
if (Buffer.byteLength(jwtSecret, 'utf8') < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 bytes (32 random bytes recommended).');
}

export const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port,
  databaseUrl: process.env.DATABASE_URL,
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  appIdOauthServerUrl: process.env.APPID_OAUTH_SERVER_URL?.trim().replace(/\/+$/, '') || '',
  appIdClientId: process.env.APPID_CLIENT_ID?.trim() || '',
  documentStorageDir: process.env.DOCUMENT_STORAGE_DIR,
  // In development, tokens expire on restart unless JWT_SECRET is provided.
  jwtSecret,
});

if (config.appIdOauthServerUrl) {
  let appIdUrl;
  try { appIdUrl = new URL(config.appIdOauthServerUrl); } catch {
    throw new Error('APPID_OAUTH_SERVER_URL must be a valid HTTPS URL.');
  }
  if (appIdUrl.protocol !== 'https:' || appIdUrl.username || appIdUrl.password || appIdUrl.search || appIdUrl.hash) {
    throw new Error('APPID_OAUTH_SERVER_URL must be a valid HTTPS URL without credentials, query, or fragment.');
  }
}
