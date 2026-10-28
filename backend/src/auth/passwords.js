import bcrypt from 'bcryptjs';

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, encoded) {
  try { return await bcrypt.compare(password, encoded); }
  catch { return false; }
}
