-- Enum de status de pagamento do racha
CREATE TYPE "PostEventPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED');

-- Tabela de pagamentos do racha pós-pago
CREATE TABLE "PostEventPayment" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "status" "PostEventPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "provider" TEXT,
  "providerPaymentId" TEXT,
  "providerPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PostEventPayment_pkey" PRIMARY KEY ("id")
);

-- Índices
CREATE INDEX "PostEventPayment_eventId_idx" ON "PostEventPayment"("eventId");
CREATE INDEX "PostEventPayment_participantId_idx" ON "PostEventPayment"("participantId");

-- FKs
ALTER TABLE "PostEventPayment"
ADD CONSTRAINT "PostEventPayment_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PostEventPayment"
ADD CONSTRAINT "PostEventPayment_participantId_fkey"
FOREIGN KEY ("participantId") REFERENCES "PostEventParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
