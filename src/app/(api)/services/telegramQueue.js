import prisma from './../../../lib/prisma.js';
import { Api } from "telegram";
import JSBI from "jsbi"; // 🔥 Importação necessária para o GramJS lidar com números longos

async function checkAndProcessQueue(client) {
  var nextMessage = null;
  var status = "PENDING";

  try {
    // 1. Busca a mensagem PENDING mais antiga da fila
    nextMessage = await prisma.messageQueue.findFirst({
      where: { status: status },
      select: {
        id: true,
        conversation: {
          select: {
            telegramChatId: true,
            telegramAccessHash: true, // 🔥 Certifique-se de que o nome no schema é exatamente este
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
      // 🔥 Cria o endereço completo para envio imediato (sem getDialogs)
      const peer = new Api.InputPeerUser({
        userId: JSBI.BigInt(chatId),
        accessHash: JSBI.BigInt(accessHash)
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

  // 6. Atualiza o status na tabela ChatMessage (Garantindo que só roda se houver mensagem)
  // 💡 Nota técnica: se você salvou o ID da ChatMessage dentro da MessageQueue,
  // mude o código abaixo para: nextMessage.chatMessageId (ou o nome do campo de relação que você criou)
  if (nextMessage) {
    try {
      await prisma.chatMessage.update({
        where: { id: nextMessage.id }, 
        data: { telegramStatus: status },
      });
    } catch (dbError) {
      console.error(`[Fila] Erro ao atualizar status na ChatMessage:`, dbError.message);
    }
  }
}

export default checkAndProcessQueue;