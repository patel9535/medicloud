import { pool } from '../db.js';
import { readAccessToken } from './tokens.js';

export async function requireAuth(request, response, next) {
  const match = /^Bearer\s+(.+)$/i.exec(request.get('authorization') ?? '');
  const token = match ? readAccessToken(match[1]) : null;
  if (!token || !pool) {
    return response.status(401).json({ success: false, data: null, message: 'Authentication required.' });
  }

  try {
    const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [token.userId]);
    if (!result.rowCount) {
      return response.status(401).json({ success: false, data: null, message: 'Authentication required.' });
    }
    request.user = result.rows[0];
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireRole(...roles) {
  return (request, response, next) => {
    if (!request.user) return response.status(401).json({ success: false, data: null, message: 'Authentication required.' });
    if (!roles.includes(request.user.role)) {
      return response.status(403).json({ success: false, data: null, message: 'You do not have permission to perform this action.' });
    }
    return next();
  };
}
