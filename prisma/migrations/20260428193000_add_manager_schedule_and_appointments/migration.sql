-- Manager schedule slots and appointment requests
CREATE TABLE IF NOT EXISTS "ManagerScheduleSlot" (
  "id" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "hour" INTEGER NOT NULL,
  "isAvailable" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "managerId" TEXT NOT NULL,
  CONSTRAINT "ManagerScheduleSlot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManagerScheduleSlot_hour_check" CHECK ("hour" >= 14 AND "hour" <= 22)
);

CREATE TABLE IF NOT EXISTS "AppointmentRequest" (
  "id" TEXT NOT NULL,
  "requestedDate" TIMESTAMP(3) NOT NULL,
  "requestedHour" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "justification" TEXT,
  "channel" TEXT NOT NULL DEFAULT 'web',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "managerId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "conversationId" TEXT,
  "managerSlotId" TEXT,
  CONSTRAINT "AppointmentRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppointmentRequest_requestedHour_check" CHECK ("requestedHour" >= 14 AND "requestedHour" <= 22)
);

CREATE UNIQUE INDEX IF NOT EXISTS "ManagerScheduleSlot_managerId_date_hour_key"
  ON "ManagerScheduleSlot"("managerId", "date", "hour");

CREATE INDEX IF NOT EXISTS "ManagerScheduleSlot_date_hour_idx"
  ON "ManagerScheduleSlot"("date", "hour");

CREATE INDEX IF NOT EXISTS "AppointmentRequest_status_createdAt_idx"
  ON "AppointmentRequest"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "AppointmentRequest_managerId_status_createdAt_idx"
  ON "AppointmentRequest"("managerId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "AppointmentRequest_requestedDate_requestedHour_idx"
  ON "AppointmentRequest"("requestedDate", "requestedHour");

ALTER TABLE "ManagerScheduleSlot"
  ADD CONSTRAINT "ManagerScheduleSlot_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AppointmentRequest"
  ADD CONSTRAINT "AppointmentRequest_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AppointmentRequest"
  ADD CONSTRAINT "AppointmentRequest_requesterId_fkey"
  FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AppointmentRequest"
  ADD CONSTRAINT "AppointmentRequest_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AppointmentRequest"
  ADD CONSTRAINT "AppointmentRequest_managerSlotId_fkey"
  FOREIGN KEY ("managerSlotId") REFERENCES "ManagerScheduleSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
