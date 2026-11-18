-- "Delete permanently" (purge) became its own path action. Every grant that already allowed or
-- denied deleting keeps doing the same for permanent deletion; administrators narrow it later.
UPDATE "app"."path_grants"
SET "actions" = array_append("actions", 'purge')
WHERE 'delete' = ANY("actions") AND NOT ('purge' = ANY("actions"));
