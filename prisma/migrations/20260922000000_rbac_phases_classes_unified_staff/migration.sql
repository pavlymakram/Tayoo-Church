-- Role hierarchy (RBAC), dynamic phases/classes, unified staff credentials.
-- Safe for existing tenants: every new column is backfilled before constraints land.

-- ---------------------------------------------------------------- churches ----
ALTER TABLE "churches" ADD COLUMN "abbreviation" TEXT;

-- Backfill: derive a stable English code for churches created before this migration.
UPDATE "churches"
SET "abbreviation" = 'church_' || substr(replace("id", '-', ''), 1, 6)
WHERE "abbreviation" IS NULL;

ALTER TABLE "churches" ALTER COLUMN "abbreviation" SET NOT NULL;
CREATE UNIQUE INDEX "churches_abbreviation_key" ON "churches"("abbreviation");

-- ------------------------------------------------------------------ phases ----
CREATE TABLE "phases" (
  "id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "abbreviation" TEXT NOT NULL,
  "sector" TEXT NOT NULL,
  "sector_abbreviation" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "phases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "phases_church_id_abbreviation_key" ON "phases"("church_id", "abbreviation");
CREATE INDEX "phases_church_id_idx" ON "phases"("church_id");
CREATE INDEX "phases_church_id_sector_idx" ON "phases"("church_id", "sector");

-- Provision the default stage catalogue for every existing church.
INSERT INTO "phases" ("id", "church_id", "name", "abbreviation", "sector", "sector_abbreviation", "sort_order", "is_active")
SELECT md5(c."id" || '_' || v."abbr"), c."id", v."name", v."abbr", v."sector", v."sector_abbr", v."sort_order", true
FROM "churches" c
CROSS JOIN (VALUES
  ('KG1', 'kg1', 'KG', 'kg', 1),
  ('KG2', 'kg2', 'KG', 'kg', 2),
  ('1 ابتدائي', 'prim1', 'PRIMARY', 'prim', 3),
  ('2 ابتدائي', 'prim2', 'PRIMARY', 'prim', 4),
  ('3 ابتدائي', 'prim3', 'PRIMARY', 'prim', 5),
  ('4 ابتدائي', 'prim4', 'PRIMARY', 'prim', 6),
  ('5 ابتدائي', 'prim5', 'PRIMARY', 'prim', 7),
  ('6 ابتدائي', 'prim6', 'PRIMARY', 'prim', 8),
  ('1 إعدادي', 'prep1', 'PREPARATORY', 'prep', 9),
  ('2 إعدادي', 'prep2', 'PREPARATORY', 'prep', 10),
  ('3 إعدادي', 'prep3', 'PREPARATORY', 'prep', 11),
  ('1 ثانوي', 'sec1', 'SECONDARY', 'sec', 12),
  ('2 ثانوي', 'sec2', 'SECONDARY', 'sec', 13),
  ('3 ثانوي', 'sec3', 'SECONDARY', 'sec', 14),
  ('جامعي', 'univ', 'UNIVERSITY', 'univ', 15),
  ('خريج', 'grad', 'GRADUATES', 'grad', 16)
) AS v("name", "abbr", "sector", "sector_abbr", "sort_order")
WHERE NOT EXISTS (
  SELECT 1 FROM "phases" p WHERE p."church_id" = c."id" AND p."abbreviation" = v."abbr"
);

-- ----------------------------------------------------------------- classes ----
CREATE TABLE "classes" (
  "id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "phase_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "classes_church_id_phase_id_name_key" ON "classes"("church_id", "phase_id", "name");
CREATE INDEX "classes_church_id_idx" ON "classes"("church_id");

-- ------------------------------------------------------------------- users ----
ALTER TABLE "users" ADD COLUMN "username" TEXT;
ALTER TABLE "users" ADD COLUMN "initial_password" TEXT;
ALTER TABLE "users" ADD COLUMN "phase_id" TEXT;
ALTER TABLE "users" ADD COLUMN "class_id" TEXT;
ALTER TABLE "users" ADD COLUMN "sector" TEXT;
ALTER TABLE "users" ADD COLUMN "is_first_admin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "created_by_id" TEXT;

-- Access codes are merged into the unified servant management table.
UPDATE "users" SET "role" = 'PHASE_SERVANT' WHERE "role" = 'SERVANT';

-- Pin students/servants to the stage matching their legacy grade, when possible.
UPDATE "users" u
SET "phase_id" = p."id"
FROM "phases" p
WHERE u."phase_id" IS NULL
  AND u."church_id" = p."church_id"
  AND u."grade" = p."name"
  AND u."role" IN ('STUDENT', 'PHASE_SERVANT');

-- Backfill usernames following the strict format:
--   {church}_admin_{5 digits} | {church}_{phase}_{5 digits} | {church}_user_{5 digits}
WITH numbered AS (
  SELECT "id",
         "church_id",
         "role",
         row_number() OVER (PARTITION BY "church_id", "role" ORDER BY "created_at", "id") AS rn
  FROM "users"
  WHERE "username" IS NULL AND "church_id" IS NOT NULL
)
UPDATE "users" u
SET "username" = c."abbreviation"
  || CASE n."role"
       WHEN 'CHURCH_ADMIN' THEN '_admin_'
       WHEN 'PHASE_ADMIN' THEN '_admin_sector_'
       WHEN 'STUDENT' THEN '_user_'
       ELSE '_phase_'
     END
  || lpad((((n.rn * 7919) % 90000) + 10000)::text, 5, '0')
FROM numbered n
JOIN "churches" c ON c."id" = n."church_id"
WHERE u."id" = n."id";

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE INDEX "users_church_id_phase_id_idx" ON "users"("church_id", "phase_id");
CREATE INDEX "users_church_id_class_id_idx" ON "users"("church_id", "class_id");

-- Only the earliest church admin of each church keeps the first-admin privilege.
UPDATE "users" u
SET "is_first_admin" = true
FROM (
  SELECT DISTINCT ON ("church_id") "id"
  FROM "users"
  WHERE "role" = 'CHURCH_ADMIN' AND "church_id" IS NOT NULL
  ORDER BY "church_id", "created_at", "id"
) first_admins
WHERE u."id" = first_admins."id";

-- ------------------------------------------------------------ foreign keys ----
ALTER TABLE "phases"
  ADD CONSTRAINT "phases_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "classes"
  ADD CONSTRAINT "classes_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "classes"
  ADD CONSTRAINT "classes_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "users"
  ADD CONSTRAINT "users_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users"
  ADD CONSTRAINT "users_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ------------------------------------------------------------ access codes ----
DROP TABLE "access_codes";

CREATE INDEX "classes_phase_id_idx" ON "classes"("phase_id");
