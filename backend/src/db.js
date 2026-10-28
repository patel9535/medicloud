import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;
export const pool = config.databaseUrl
  ? new Pool({
    connectionString: config.databaseUrl,
    ...(process.env.DATABASE_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
  })
  : null;

export async function checkDatabase() {
  if (!pool) throw new Error('DATABASE_URL is not configured.');
  await pool.query('SELECT 1');
}
