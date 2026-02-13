-- Adiciona chave PIX opcional ao usuário (para recebimento no fluxo POS_PAGO via PIX manual)
ALTER TABLE "User"
ADD COLUMN "pixKey" TEXT;
