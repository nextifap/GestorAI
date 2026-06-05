import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import { saveSystemLog } from '@/lib/systemLog';
import { verifyRequestToken } from '@/lib/auth';
import { errorResponse, respondAuthError } from '@/lib/apiErrors';

// Rota GET para buscar todas as mensagens de uma conversa
export async function GET(request, { params }) {

  params = await params;

  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return respondAuthError(verificacao);
  }

  const { id: userId } = verificacao.usuario;
  const conversationId = params.conversationId;
  const isPooling = params.isPooling === 'true' || params.isPooling === true; // Parâmetro para indicar se é uma requisição de pooling (atualização periódica)

  try {
    // 1. Calcula a data de 3 meses atrás
    const seisMesesAtras = new Date();
    seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6);

    // 2. Busca a conversa com o filtro de tempo e limite
    const conversationWithMessages = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId: userId,
        ...(isPooling && { newMessages: true }),
      },
      include: {
        messages: {
          where: {
            createdAt: {
              gte: seisMesesAtras, //mensagens criadas de 3 meses atrás até hoje
            },
          },
          orderBy: { createdAt: 'desc' }, //  Pega as mais recentes primeiro para o 'take' não cortar as erradas
          take: 100, //Trava de segurança: traz no máximo 150 mensagens
        },
      },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { newMessages: false }, // Marca que as mensagens foram lidas/visualizadas
    });

    // 3. Reorganiza na ordem cronológica (antiga -> nova) para o chat fazer sentido na tela
    if (conversationWithMessages && conversationWithMessages.messages) {
      conversationWithMessages.messages.reverse();
    }

    if (!conversationWithMessages) {
      return errorResponse('CHAT_CONVERSATION_NOT_FOUND');
    }

    return NextResponse.json({ conversation: conversationWithMessages }, { status: 200 });

  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/chat/[conversationId]',
      message: 'Erro ao buscar mensagens da conversa.',
      context: { error, conversationId, userId },
    });
    return errorResponse('CHAT_MESSAGES_FETCH_FAILED');
  }
}