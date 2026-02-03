-- Adiciona flag de soft delete em PostEventParticipant
ALTER TABLE "PostEventParticipant"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT TRUE;
