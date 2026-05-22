-- DropIndex
DROP INDEX "Contact_telephone_key";

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "userId" TEXT;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
