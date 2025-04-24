/*
  Warnings:

  - A unique constraint covering the columns `[clerk]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `clerk` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "clerk" TEXT NOT NULL,
ALTER COLUMN "createdAt" DROP NOT NULL,
ALTER COLUMN "updatedAt" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_clerk_key" ON "User"("clerk");
