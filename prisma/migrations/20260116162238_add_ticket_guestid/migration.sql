/*
  Warnings:

  - A unique constraint covering the columns `[guestId]` on the table `Ticket` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "guestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_guestId_key" ON "Ticket"("guestId");

-- CreateIndex
CREATE INDEX "Ticket_userId_idx" ON "Ticket"("userId");

-- CreateIndex
CREATE INDEX "Ticket_eventId_idx" ON "Ticket"("eventId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "EventGuest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
