-- Legacy recipient table is deprecated. Broadcast recipients are now list<->lead joins.
DROP TABLE IF EXISTS "whatsapp_broadcast_list_members";

-- Keep denormalized count in sync with join table.
UPDATE "whatsapp_broadcast_lists" bl
SET "memberCount" = c.cnt
FROM (
  SELECT "listId", COUNT(*)::int AS cnt
  FROM "whatsapp_broadcast_list_leads"
  GROUP BY "listId"
) c
WHERE bl."id" = c."listId";
