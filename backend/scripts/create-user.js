import { pool } from '../src/db.js';
import { hashPassword } from '../src/auth/passwords.js';

const args = Object.fromEntries(process.argv.slice(2).map((value) => {
  const [key, ...rest] = value.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));
const role = (args.role ?? '').toUpperCase();
const name = (args.name ?? '').trim();
const email = (args.email ?? '').trim().toLowerCase();
const username = (args.username ?? '').trim();
const password = args.password ?? '';
const hasLocalCredentials = Boolean(username || password);
if (!['DOCTOR', 'ADMIN'].includes(role) || name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  || (hasLocalCredentials && (role !== 'DOCTOR' || !/^[a-zA-Z0-9._-]{3,40}$/.test(username) || password.length < 8 || password.length > 128))) {
  console.error('Usage: npm run user:create -w backend -- --role=DOCTOR --name="Full Name" --email=user@example.test [--username=Doctor001 --password="ChooseASecret"]');
  process.exitCode = 2;
} else if (!pool) {
  console.error('DATABASE_URL is required.');
  process.exitCode = 2;
} else {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id, role FROM users WHERE lower(email) = $1 FOR UPDATE', [email]);
    let userId;
    if (existing.rowCount) {
      const user = existing.rows[0];
      if (role !== 'DOCTOR' || !['PATIENT', 'DOCTOR'].includes(user.role)) {
        throw new Error('EXISTING_ACCOUNT_ROLE_CONFLICT');
      }
      userId = user.id;
      if (user.role !== 'DOCTOR') {
        await client.query("UPDATE users SET name = $1, role = 'DOCTOR', updated_at = now() WHERE id = $2", [name, userId]);
      } else {
        await client.query('UPDATE users SET name = $1, updated_at = now() WHERE id = $2', [name, userId]);
      }
    } else {
      const result = await client.query('INSERT INTO users (name, email, role) VALUES ($1, $2, $3) RETURNING id', [name, email, role]);
      userId = result.rows[0].id;
    }
    if (role === 'DOCTOR') {
      await client.query(
        "INSERT INTO doctors (user_id, specialization, license_number) VALUES ($1, 'General Practice', $2) ON CONFLICT (user_id) DO NOTHING",
        [userId, `DEMO-${userId}`],
      );
      if (hasLocalCredentials) {
        const passwordHash = await hashPassword(password);
        await client.query(
          `INSERT INTO local_credentials (user_id, username, password_hash)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id) DO UPDATE
           SET username = EXCLUDED.username, password_hash = EXCLUDED.password_hash, updated_at = now()`,
          [userId, username, passwordHash],
        );
      }
    }
    await client.query('COMMIT');
    console.log(hasLocalCredentials
      ? `Provisioned ${role} account with local username ${username}; the password is stored as a bcrypt hash.`
      : `Provisioned ${role} account. Sign in with IBM App ID using its matching verified email.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error.message === 'EXISTING_ACCOUNT_ROLE_CONFLICT'
      ? 'An account exists with another role. Only an existing patient account can be promoted to doctor with this command.'
      : error.code === '23505' ? 'The account conflicts with an existing user or doctor license.' : 'Unable to provision account. Check database access and migrations.');
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}
