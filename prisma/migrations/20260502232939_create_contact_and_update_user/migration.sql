/*
  Warnings:

  - You are about to drop the `CurriculumChunk` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `contactId` to the `Conversation` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- Nota: originalmente essa coluna foi criada como NOT NULL e causou falha
-- quando havia registros existentes em "Conversation" com valor NULL.
-- Para permitir aplicar a migration em bases com dados existentes,
-- adicionamos a coluna como NULLABLE. Depois faça um migration
-- separado para tornar NOT NULL após backfill.
ALTER TABLE "Conversation" ADD COLUMN "contactId" TEXT;

-- DropTable
DROP TABLE "CurriculumChunk";

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "telephone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contact_telephone_key" ON "Contact"("telephone");

-- CreateIndex
CREATE INDEX "Contact_id_name_telephone_idx" ON "Contact"("id", "name", "telephone");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
