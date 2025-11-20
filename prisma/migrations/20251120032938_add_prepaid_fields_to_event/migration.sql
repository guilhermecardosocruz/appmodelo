-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "paymentLink" TEXT,
ADD COLUMN     "salesEnd" TIMESTAMP(3),
ADD COLUMN     "salesStart" TIMESTAMP(3),
ADD COLUMN     "ticketPrice" TEXT;
