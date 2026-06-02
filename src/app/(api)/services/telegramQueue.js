import prisma from './../../../lib/prisma.js';
import { Api } from "telegram";

async function checkAndProcessQueue(client) {
  var nextMessage = null;
  var status = "PENDING";

  try {
    // 1. Busca a mensagem PENDING mais antiga da fila
    nextMessage = await prisma.messageQueue.findFirst({
      where: { status: status },
      select: {
        id: true,
        conversationId: true, // 🔥 Buscando o ID real da ChatMessage para corrigir o erro final
        conversation: {
          select: {
            telegramChatId: true,
            telegramAccessHash: true, 
          },
        },
        text: true,
      },
      orderBy: { createdAt: "asc" }, // Garante a ordem de chegada (FIFO)
    });

    // Se não há nada pendente, encerra a execução atual
    if (!nextMessage) return;

    console.log(`[Fila] Processando mensagem ID: ${nextMessage.id} para ${nextMessage.conversation.telegramChatId}`);

    status = "PROCESSING";

    // 2. Bloqueia a mensagem mudando para PROCESSING
    await prisma.messageQueue.update({
      where: { id: nextMessage.id },
      data: { status: status },
    });

    // 3. Monta o destino (Peer) utilizando o Access Hash se ele existir
    const chatId = nextMessage.conversation.telegramChatId;
    const accessHash = nextMessage.conversation.telegramAccessHash;

    if (accessHash) {
      // 🔥 Correção: Usando BigInt nativo para evitar o erro "shiftRight is not a function"
      // O BigInt nativo do JavaScript lê perfeitamente strings com números negativos.
      const peer = new Api.InputPeerUser({
        userId: BigInt(chatId),
        accessHash: BigInt(accessHash)
      });

      await client.sendMessage(peer, { 
        message: nextMessage.text 
      });
      console.log(`[Fila] Mensagem enviada direto via Access Hash.`);
    } else {
      // ⚠️ Fallback caso a conversa antiga não tenha salvo o hash
      console.warn(`[Fila] Conversa sem accessHash para o ID ${chatId}. Usando fallback lento...`);
      await client.getDialogs({});
      await client.sendMessage(chatId, { 
        message: nextMessage.text 
      });
    }

    status = "SENT";

    // 4. Se deu certo, marca como SENT na Fila
    await prisma.messageQueue.update({
      where: { id: nextMessage.id },
      data: { status: status },
    });

    console.log(`[Fila] Mensagem enviada com sucesso para ${chatId}!`);

  } catch (error) {
    console.error(`[Fila] Erro ao processar mensagem:`, error.message);

    status = "FAILED";
    
    // 5. Se der erro, salva o motivo na tabela de fila
    if (nextMessage?.id) {
      await prisma.messageQueue.update({
        where: { id: nextMessage.id },
        data: { 
          status: status,
          error: error.message 
        },
      });
    }
  }

  // 6. Atualiza o status na tabela ChatMessage usando a relação correta
  // 🔥 Correção: Agora usa o 'chatMessageId' em vez de usar o ID da fila, evitando o erro de registro não encontrado
  if (nextMessage && nextMessage.chatMessageId) {
    try {
      await prisma.chatMessage.update({
        where: { id: nextMessage.chatMessageId }, 
        data: { telegramStatus: status },
      });
    } catch (dbError) {
      console.error(`[Fila] Erro ao atualizar status na ChatMessage:`, dbError.message);
    }
  }
}

export default checkAndProcessQueue;