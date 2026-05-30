-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "nomeCompleto" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "mustChangeCredentials" BOOLEAN NOT NULL DEFAULT false,
    "telegram_id" TEXT
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CampusEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "eventDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "CampusEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "telephone" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT,
    "deleted" INTEGER,
    CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "summary" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "channel" TEXT NOT NULL DEFAULT 'web',
    "handlingMode" TEXT NOT NULL DEFAULT 'Automatizado',
    "handoverAt" DATETIME,
    "handoverNote" TEXT,
    "triageScore" REAL,
    "triageReason" TEXT,
    "userId" TEXT NOT NULL,
    "contactId" TEXT,
    "telegramChatId" TEXT,
    "newMessages" BOOLEAN,
    CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ManagerScheduleSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "hour" INTEGER NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "managerId" TEXT NOT NULL,
    CONSTRAINT "ManagerScheduleSlot_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppointmentRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestedDate" DATETIME NOT NULL,
    "requestedHour" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "justification" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "managerId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "conversationId" TEXT,
    "managerSlotId" TEXT,
    CONSTRAINT "AppointmentRequest_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AppointmentRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AppointmentRequest_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AppointmentRequest_managerSlotId_fkey" FOREIGN KEY ("managerSlotId") REFERENCES "ManagerScheduleSlot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" TEXT NOT NULL,
    CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MessageQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "short_name" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "founded_year" INTEGER,
    "status" TEXT,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institution_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "degree" TEXT,
    "duration_semesters" INTEGER,
    "workload_hours" INTEGER,
    "objective" TEXT,
    "audience" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Course_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "Institution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CurriculumOverview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "course_id" TEXT NOT NULL,
    "semester" INTEGER,
    "topics" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CurriculumOverview_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AcademicCalendarEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institution_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "event_date" DATETIME,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcademicCalendarEvent_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "Institution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Infrastructure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institution_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "features" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Infrastructure_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "Institution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FacultyMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institution_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "profile" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FacultyMember_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "Institution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RagMetadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "tags" JSONB,
    "version" TEXT,
    "language" TEXT,
    "last_updated" DATETIME,
    "raw" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "institution_id" TEXT,
    CONSTRAINT "RagMetadata_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "Institution" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegram_id_key" ON "User"("telegram_id");

-- CreateIndex
CREATE INDEX "CampusEvent_eventDate_idx" ON "CampusEvent"("eventDate");

-- CreateIndex
CREATE INDEX "CampusEvent_userId_eventDate_idx" ON "CampusEvent"("userId", "eventDate");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_telephone_key" ON "Contact"("telephone");

-- CreateIndex
CREATE INDEX "Contact_id_name_telephone_idx" ON "Contact"("id", "name", "telephone");

-- CreateIndex
CREATE INDEX "Conversation_status_createdAt_idx" ON "Conversation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Conversation_channel_createdAt_idx" ON "Conversation"("channel", "createdAt");

-- CreateIndex
CREATE INDEX "ManagerScheduleSlot_date_hour_idx" ON "ManagerScheduleSlot"("date", "hour");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerScheduleSlot_managerId_date_hour_key" ON "ManagerScheduleSlot"("managerId", "date", "hour");

-- CreateIndex
CREATE INDEX "AppointmentRequest_status_createdAt_idx" ON "AppointmentRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AppointmentRequest_requestedDate_requestedHour_idx" ON "AppointmentRequest"("requestedDate", "requestedHour");

-- CreateIndex
CREATE INDEX "AppointmentRequest_managerId_status_createdAt_idx" ON "AppointmentRequest"("managerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SystemLog_createdAt_idx" ON "SystemLog"("createdAt");

-- CreateIndex
CREATE INDEX "SystemLog_level_idx" ON "SystemLog"("level");
