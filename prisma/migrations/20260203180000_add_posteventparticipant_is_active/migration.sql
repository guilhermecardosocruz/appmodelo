-- Adiciona coluna de status (ativo/inativo) para participantes de racha
ALTER TABLE "PostEventParticipant"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
