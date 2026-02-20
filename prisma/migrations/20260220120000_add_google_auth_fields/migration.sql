-- Adiciona campo opcional googleId na tabela User para login social
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;

-- Garante unicidade por conta Google
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
