-- Adiciona flag de encerramento no evento (racha pós-pago)
ALTER TABLE "Event"
ADD COLUMN "isClosed" BOOLEAN NOT NULL DEFAULT FALSE;
