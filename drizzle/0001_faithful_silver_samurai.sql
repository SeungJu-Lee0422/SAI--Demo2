-- Adopt the existing Site schema. The previous Worker already added these
-- columns; deployment failed before recording this migration. Verified with
-- the production D1 schema on 2026-10-03. Do not repeat ALTER TABLE.
SELECT instagram_handle, instagram_visible FROM profiles LIMIT 0;
