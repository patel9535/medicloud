ALTER TABLE local_credentials
  ADD COLUMN username text;

CREATE UNIQUE INDEX local_credentials_username_unique
  ON local_credentials (lower(username))
  WHERE username IS NOT NULL;
