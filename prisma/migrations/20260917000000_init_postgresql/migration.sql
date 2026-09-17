-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE "churches" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "license_key" TEXT NOT NULL,
  "default_mass_points" INTEGER NOT NULL DEFAULT 5, "default_service_points" INTEGER NOT NULL DEFAULT 3,
  "is_active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "churches_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "users" (
  "id" TEXT NOT NULL, "church_id" TEXT, "role" TEXT NOT NULL DEFAULT 'STUDENT', "full_name" TEXT NOT NULL,
  "phone" TEXT NOT NULL, "email" TEXT, "secondary_phone" TEXT, "address" TEXT, "grade" TEXT,
  "birth_date" TIMESTAMP(3), "confession_father" TEXT, "father_job" TEXT, "mother_job" TEXT,
  "is_mother_working" BOOLEAN NOT NULL DEFAULT false, "qr_code_id" TEXT NOT NULL, "password_hash" TEXT,
  "pin_hash" TEXT, "role_security_code_hash" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "access_codes" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "role" TEXT NOT NULL, "church_id" TEXT,
  "login_user_id" TEXT NOT NULL, "password_hash" TEXT NOT NULL, "max_uses" INTEGER,
  "usage_count" INTEGER NOT NULL DEFAULT 0, "expires_at" TIMESTAMP(3), "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "access_codes_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "event_types" (
  "id" TEXT NOT NULL, "church_id" TEXT NOT NULL, "title" TEXT NOT NULL,
  "default_points" INTEGER NOT NULL DEFAULT 0, "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "event_types_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "point_transactions" (
  "id" TEXT NOT NULL, "church_id" TEXT NOT NULL, "student_id" TEXT NOT NULL, "servant_id" TEXT NOT NULL,
  "event_type_id" TEXT NOT NULL, "points_amount" INTEGER NOT NULL, "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "churches_license_key_key" ON "churches"("license_key");
CREATE UNIQUE INDEX "users_qr_code_id_key" ON "users"("qr_code_id");
CREATE INDEX "users_church_id_idx" ON "users"("church_id");
CREATE INDEX "idx_users_church_role" ON "users"("church_id", "role");
CREATE INDEX "users_email_idx" ON "users"("email");
CREATE INDEX "users_full_name_idx" ON "users"("full_name");
CREATE INDEX "users_qr_code_id_idx" ON "users"("qr_code_id");
CREATE UNIQUE INDEX "users_church_id_phone_key" ON "users"("church_id", "phone");
CREATE UNIQUE INDEX "access_codes_code_key" ON "access_codes"("code");
CREATE UNIQUE INDEX "access_codes_login_user_id_key" ON "access_codes"("login_user_id");
CREATE INDEX "access_codes_church_id_role_idx" ON "access_codes"("church_id", "role");
CREATE INDEX "access_codes_is_active_expires_at_idx" ON "access_codes"("is_active", "expires_at");
CREATE INDEX "event_types_church_id_idx" ON "event_types"("church_id");
CREATE INDEX "point_transactions_church_id_idx" ON "point_transactions"("church_id");
CREATE INDEX "point_transactions_student_id_idx" ON "point_transactions"("student_id");
CREATE INDEX "point_transactions_created_at_idx" ON "point_transactions"("created_at");
CREATE INDEX "idx_transactions_student_church" ON "point_transactions"("student_id", "church_id");
CREATE INDEX "idx_transactions_created" ON "point_transactions"("created_at" DESC);

ALTER TABLE "users" ADD CONSTRAINT "users_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_login_user_id_fkey" FOREIGN KEY ("login_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_servant_id_fkey" FOREIGN KEY ("servant_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "event_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
