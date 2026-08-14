-- ============================================================================
--  Set the initial login passwords.
--  Run in the Supabase SQL Editor, AFTER prisma/supabase-setup.sql.
--
--      admin@sana.com   ->  Admin@12345   (ADMIN)
--      ayesha@sana.com  ->  Staff@12345   (STAFF)
--
--  The digests below are PBKDF2-HMAC-SHA512, 210,000 iterations, 64-byte key,
--  lowercase hex — byte-for-byte the parameters in
--  src/lib/auth/users.server.ts:27-46. Postgres cannot compute PBKDF2
--  (pgcrypto's crypt() only does bf/md5/xdes/des), so they were generated with
--  node:crypto and checked against the app's own verifyPassword().
--
--  UPDATE-then-INSERT rather than a plain INSERT: prisma/seed.ts and
--  supabase-setup.sql both skip accounts that already exist, so an insert-only
--  script silently leaves the old password in place. This always converges on
--  the password above whether the row exists or not.
--
--  Re-running is safe and idempotent.
-- ============================================================================

BEGIN;

/* ------------------------------------------------- admin@sana.com --------- */

UPDATE users SET
  password_hash      = 'a6b8727a7c28852fa715d19fa920280ef58f6d9eb25335874b3b44335cef7a523ef1c4bd766c127fb929f5a6bb9b18a96a9e05290f8e11289f2a779f0d821437',
  password_salt      = '0d3ac6e95cb1de909541fbc7c0b20f7a',
  name               = 'Sana Malik',
  active             = true,
  failed_login_count = 0,     -- clear any lockout from failed attempts
  locked_until       = NULL,
  role_id            = (SELECT id FROM user_roles WHERE key = 'ADMIN'),
  updated_at         = now()
WHERE email = 'admin@sana.com';

INSERT INTO users (
  id, email, name, password_hash, password_salt, active, failed_login_count,
  sessions_valid_from, created_at, updated_at, role_id, staff_id
)
SELECT
  'usr_admin', 'admin@sana.com', 'Sana Malik',
  'a6b8727a7c28852fa715d19fa920280ef58f6d9eb25335874b3b44335cef7a523ef1c4bd766c127fb929f5a6bb9b18a96a9e05290f8e11289f2a779f0d821437',
  '0d3ac6e95cb1de909541fbc7c0b20f7a',
  true, 0, now(), now(), now(),
  (SELECT id FROM user_roles WHERE key = 'ADMIN'),
  (SELECT id FROM staff WHERE id = 'stf_sana')
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@sana.com');

/* ------------------------------------------------ ayesha@sana.com --------- */

UPDATE users SET
  password_hash      = 'f4572a03f490c0220c90776677c8c07fc8e56a9922db38ace6e577f57c1884a48045038c1feb6c09a1fb913e0a73f1224aba47fa2896aefbb7b05b58d00c3baf',
  password_salt      = '78c76af109b4dad8e3371171bbed8dab',
  name               = 'Ayesha Khan',
  active             = true,
  failed_login_count = 0,
  locked_until       = NULL,
  role_id            = (SELECT id FROM user_roles WHERE key = 'STAFF'),
  updated_at         = now()
WHERE email = 'ayesha@sana.com';

INSERT INTO users (
  id, email, name, password_hash, password_salt, active, failed_login_count,
  sessions_valid_from, created_at, updated_at, role_id, staff_id
)
SELECT
  'usr_ayesha_login', 'ayesha@sana.com', 'Ayesha Khan',
  'f4572a03f490c0220c90776677c8c07fc8e56a9922db38ace6e577f57c1884a48045038c1feb6c09a1fb913e0a73f1224aba47fa2896aefbb7b05b58d00c3baf',
  '78c76af109b4dad8e3371171bbed8dab',
  true, 0, now(), now(), now(),
  (SELECT id FROM user_roles WHERE key = 'STAFF'),
  (SELECT id FROM staff WHERE id = 'stf_ayesha')
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'ayesha@sana.com');

COMMIT;

/* ----------------------------------------------------------- verify ------ */
-- hash_len must be 128 and active must be true for both rows.

SELECT u.email, u.name, r.key AS role, u.active,
       length(u.password_hash) AS hash_len,
       length(u.password_salt) AS salt_len,
       u.failed_login_count, u.locked_until
FROM users u
JOIN user_roles r ON r.id = u.role_id
WHERE u.email IN ('admin@sana.com', 'ayesha@sana.com')
ORDER BY u.email;
