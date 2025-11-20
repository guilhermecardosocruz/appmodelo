-- CreateTable
CREATE TABLE "EventConfirmation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventConfirmation_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "EventConfirmation" ADD CONSTRAINT "EventConfirmation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
