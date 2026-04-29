ALTER TABLE "User"
ADD COLUMN "telegramChatId" TEXT;

CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

ALTER TABLE "Conversation"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'web',
ADD COLUMN "handoverAt" TIMESTAMP(3),
ADD COLUMN "handoverNote" TEXT;

CREATE INDEX "Conversation_status_createdAt_idx" ON "Conversation"("status", "createdAt");
CREATE INDEX "Conversation_channel_createdAt_idx" ON "Conversation"("channel", "createdAt");
