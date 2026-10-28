import { pool } from '../src/db.js';

const args = Object.fromEntries(process.argv.slice(2).map((value) => {
  const [key, ...rest] = value.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));
const role = (args.role ?? '').toUpperCase();
const name = (args.name ?? '').trim();
const email = (args.email ?? '').trim().toLowerCase();
if (!['DOCTOR', 'ADMIN'].includes(role) || name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: npm run user:create -w backend -- --role=DOCTOR|ADMIN --name="Full Name" --email=user@example.test');
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
      if (role !== 'DOCTOR' || user.role !== 'PATIENT') {
        throw new Error('EXISTING_ACCOUNT_ROLE_CONFLICT');
      }
      userId = user.id;
      await client.query("UPDATE users SET name = $1, role = 'DOCTOR', updated_at = now() WHERE id = $2", [name, userId]);
    } else {
      const result = await client.query('INSERT INTO users (name, email, role) VALUES ($1, $2, $3) RETURNING id', [name, email, role]);
      userId = result.rows[0].id;
    }
    if (role === 'DOCTOR') {
      await client.query(
        "INSERT INTO doctors (user_id, specialization, license_number) VALUES ($1, 'General Practice', $2) ON CONFLICT (user_id) DO NOTHING",
        [userId, `DEMO-${userId}`],
      );
    }
    await client.query('COMMIT');
    console.log(`Provisioned ${role} account. Sign in with IBM App ID using its matching verified email.`);
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
