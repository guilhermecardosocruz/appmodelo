/*
  Warnings:

  - A unique constraint covering the columns `[inviteSlug]` on the table `Event` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "description" TEXT,
ADD COLUMN     "inviteSlug" TEXT,
ADD COLUMN     "location" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Event_inviteSlug_key" ON "Event"("inviteSlug");
