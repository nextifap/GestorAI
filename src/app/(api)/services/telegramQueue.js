import prisma from './../../../lib/prisma.js';

async function checkAndProcessQueue(client) {
  try {
    // 1. Busca a mensagem PENDING mais antiga da fila
    const nextMessage = await prisma.messageQueue.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" }, // Garante a ordem de chegada (FIFO)
    });

    // Se não há nada pendente, encerra a execução atual e espera o próximo intervalo
    if (!nextMessage) return;

    console.log(`[Fila] Processando mensagem ID: ${nextMessage.id} para ${nextMessage.chatId}`);

    // 2. Bloqueia a mensagem mudando para PROCESSING
    // Isso evita que o loop tente ler a mesma mensagem duas vezes se o envio demorar
    await prisma.messageQueue.update({
      where: { id: nextMessage.id },
      data: { status: "PROCESSING" },
    });

    // 3. Envia de fato no Telegram usando o GramJS
    await client.sendMessage(nextMessage.chatId, { 
      message: nextMessage.text 
    });

    // 4. Se deu certo, marca como SENT
    await prisma.messageQueue.update({
      where: { id: nextMessage.id },
      data: { status: "SENT" },
    });

    console.log(`[Fila] Mensagem enviada com sucesso para ${nextMessage.chatId}!`);

  } catch (error) {
    console.error(`[Fila] Erro ao processar mensagem:`, error.message);

    // 5. Se der erro (ex: ID não existe, número inválido), salva o motivo na tabela
    // IMPORTANTE: Buscamos pelo ID que tentamos processar para registrar a falha
    if (nextMessage?.id) {
      await prisma.messageQueue.update({
        where: { id: nextMessage.id },
        data: { 
          status: "FAILED",
          error: error.message 
        },
      });
    }
  }
}

export default checkAndProcessQueue;