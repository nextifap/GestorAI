-- Add telegram_id with unique constraint and migrate existing telegramChatId data when present.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegram_id" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'telegramChatId'
  ) THEN
    UPDATE "User"
    SET "telegram_id" = COALESCE("telegram_id", "telegramChatId")
    WHERE "telegramChatId" IS NOT NULL;

    ALTER TABLE "User" DROP COLUMN "telegramChatId";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE indexname = 'User_telegram_id_key'
  ) THEN
    CREATE UNIQUE INDEX "User_telegram_id_key" ON "User"("telegram_id");
  END IF;
END $$;

-- Add conversation operational fields for triage and manual takeover state.
ALTER TABLE "Conversation"
  ADD COLUMN IF NOT EXISTS "handlingMode" TEXT NOT NULL DEFAULT 'Automatizado',
  ADD COLUMN IF NOT EXISTS "triageScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "triageReason" TEXT;
