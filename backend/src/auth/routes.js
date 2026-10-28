import { Router } from 'express';
import passport from 'passport';
import { APIStrategy } from 'ibmcloud-appid';
import { pool } from '../db.js';
import { config } from '../config.js';
import { createAccessToken } from './tokens.js';
import { requireAuth } from './middleware.js';
import { verifyPassword } from './passwords.js';

export const authRouter = Router();

authRouter.post('/local/session', async (request, response, next) => {
  const username = typeof request.body?.username === 'string' ? request.body.username.trim() : '';
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  if (!pool) return response.status(503).json({ success: false, data: null, message: 'Database is not configured.' });
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username) || password.length < 1 || password.length > 128) {
    return response.status(401).json({ success: false, data: null, message: 'Invalid username or password.' });
  }

  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, credentials.password_hash AS "passwordHash"
       FROM local_credentials credentials
       JOIN users u ON u.id = credentials.user_id
       WHERE lower(credentials.username) = lower($1)`,
      [username],
    );
    const account = result.rows[0];
    if (!account || account.role !== 'DOCTOR' || !(await verifyPassword(password, account.passwordHash))) {
      return response.status(401).json({ success: false, data: null, message: 'Invalid username or password.' });
    }

    const user = { id: account.id, name: account.name, email: account.email, role: account.role };
    return response.json({
      success: true,
      data: { user, accessToken: createAccessToken(user.id) },
      message: 'Signed in.',
    });
  } catch (error) {
    return next(error);
  }
});

const appIdStrategy = config.appIdOauthServerUrl
  ? new APIStrategy({
    oauthServerUrl: config.appIdOauthServerUrl,
    ...(config.appIdClientId ? { audience: config.appIdClientId } : {}),
  })
  : null;
if (appIdStrategy) passport.use(appIdStrategy);

function requireAppId(request, response, next) {
  if (!appIdStrategy) {
    return response.status(503).json({ success: false, data: null, message: 'IBM App ID is not configured. Set APPID_OAUTH_SERVER_URL and the frontend App ID settings.' });
  }
  return passport.authenticate(APIStrategy.STRATEGY_NAME, { session: false }, (error) => {
    if (error) return next(error);
    if (!request.appIdAuthorizationContext?.identityTokenPayload) {
      return response.status(401).json({ success: false, data: null, message: 'App ID did not provide a valid identity token.' });
    }
    return next();
  })(request, response, next);
}

authRouter.post('/appid/session', requireAppId, async (request, response, next) => {
  if (!pool) return next(new Error('Database is not configured.'));
  const authorization = request.appIdAuthorizationContext;
  const identity = authorization.identityTokenPayload;
  const accessToken = authorization.accessToken;
  const oauthServerUrl = config.appIdOauthServerUrl.replace(/\/+$/, '');

  try {
    const profileResponse = await fetch(`${oauthServerUrl}/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!profileResponse.ok) {
      return response.status(401).json({ success: false, data: null, message: 'Could not read your verified IBM App ID profile. Check the App ID profile/email settings.' });
    }
    const profile = await profileResponse.json();
    const externalId = typeof identity.sub === 'string' ? identity.sub : '';
    const providerProfile = Array.isArray(profile.identities)
      ? profile.identities.find((entry) => entry?.id === externalId || entry?.provider === identity.amr?.[0])?.profile ?? {}
      : {};
    const rawEmail = profile.email ?? identity.email ?? providerProfile.email;
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    const firstName = profile.given_name ?? profile.firstName ?? profile.first_name
      ?? identity.given_name ?? providerProfile.given_name ?? providerProfile.firstName ?? providerProfile.first_name;
    const lastName = profile.family_name ?? profile.lastName ?? profile.last_name
      ?? identity.family_name ?? providerProfile.family_name ?? providerProfile.lastName ?? providerProfile.last_name;
    const name = [profile.name, providerProfile.name, [firstName, lastName].filter((part) => typeof part === 'string' && part.trim()).join(' '), identity.name, email]
      .find((candidate) => typeof candidate === 'string' && candidate.trim().length >= 2)?.trim();
    const emailVerified = identity.email_verified === true
      || authorization.accessTokenPayload.email_verified === true
      || profile.email_verified === true || profile.verified_email === true
      || providerProfile.email_verified === true || providerProfile.verified_email === true;
    if (!externalId || profile.sub !== externalId || !emailVerified || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 120) {
      return response.status(422).json({ success: false, data: null, message: emailVerified
        ? 'App ID must provide a valid email address and first name. Check the user profile attributes.'
        : 'Please verify your email address in IBM App ID, then sign in again.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        `SELECT id, name, email, role, app_id_user_id AS "appIdUserId"
         FROM users WHERE app_id_user_id = $1 OR lower(email) = $2 FOR UPDATE`,
        [externalId, email],
      );
      let user;
      if (existing.rowCount) {
        user = existing.rows[0];
        if (user.appIdUserId && user.appIdUserId !== externalId) {
          await client.query('ROLLBACK');
          return response.status(409).json({ success: false, data: null, message: 'This email is already linked to a different App ID identity. Contact the MediCloud administrator.' });
        }
        const updated = await client.query(
          `UPDATE users SET app_id_user_id = $1, name = $2, email = $3, updated_at = now()
           WHERE id = $4 RETURNING id, name, email, role`,
          [externalId, name, email, user.id],
        );
        user = updated.rows[0];
      } else {
        const inserted = await client.query(
          `INSERT INTO users (name, email, role, app_id_user_id)
           VALUES ($1, $2, 'PATIENT', $3) RETURNING id, name, email, role`,
          [name, email, externalId],
        );
        user = inserted.rows[0];
        await client.query('INSERT INTO patients (user_id) VALUES ($1)', [user.id]);
      }
      await client.query('COMMIT');
      return response.json({ success: true, data: { user, accessToken: createAccessToken(user.id) }, message: 'Signed in with IBM App ID.' });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') {
        return response.status(409).json({ success: false, data: null, message: 'This App ID profile is already linked to another account.' });
      }
      return next(error);
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.name === 'TimeoutError') {
      return response.status(503).json({ success: false, data: null, message: 'IBM App ID profile lookup timed out. Try signing in again.' });
    }
    return next(error);
  }
});

authRouter.get('/me', requireAuth, (request, response) => {
  response.json({ success: true, data: { user: request.user }, message: 'Current user.' });
});

authRouter.post('/logout', requireAuth, (_request, response) => {
  // Access tokens are short-lived and stateless; the client discards the token on logout.
  response.json({ success: true, data: null, message: 'Signed out.' });
});
