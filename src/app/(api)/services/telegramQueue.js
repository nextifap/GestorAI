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
        conversationId: true,
        conversation: {
          select: {
            telegramChatId: true,
            telegramAccessHash: true, 
          },
        },
        text: true,
      },
      orderBy: { createdAt: "asc" },
    });

    if (!nextMessage) return;

    console.log(`[Fila] Processando mensagem ID: ${nextMessage.id} para ${nextMessage.conversation.telegramChatId}`);

    status = "PROCESSING";

    await prisma.messageQueue.update({
      where: { id: nextMessage.id },
      data: { status: status },
    });

    const chatId = nextMessage.conversation.telegramChatId;
    const accessHash = nextMessage.conversation.telegramAccessHash;

    if (accessHash) {

      const peer = new Api.InputPeerUser({
        userId: BigInt(chatId),
        accessHash: BigInt(accessHash)
      });

      await client.sendMessage(peer, { 
        message: nextMessage.text 
      });
      console.log(`[Fila] Mensagem enviada direto via Access Hash.`);
    } else {

      console.warn(`[Fila] Conversa sem accessHash para o ID ${chatId}. Usando fallback lento...`);
      await client.getDialogs({});
      await client.sendMessage(chatId, { 
        message: nextMessage.text 
      });
    }

    status = "SENT";

    await prisma.messageQueue.update({
      where: { id: nextMessage.id },
      data: { status: status },
    });

    console.log(`[Fila] Mensagem enviada com sucesso para ${chatId}!`);

  } catch (error) {
    console.error(`[Fila] Erro ao processar mensagem:`, error.message);

    status = "FAILED";
    
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