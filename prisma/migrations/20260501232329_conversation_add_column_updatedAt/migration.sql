-- Atualiza a tabela Conversation para adicionar a coluna updatedAt
ALTER TABLE "Conversation" 
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;