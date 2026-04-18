import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import prisma from '../../../../../lib/prisma';
import { saveSystemLog } from '@/lib/systemLog';

// Middleware para verificar a autenticação (pode ser a mesma função reutilizada)
function verificarToken(request) {
  const token = request.headers.get('authorization')?.split(' ')[1];
  if (!token) return { error: 'Token não fornecido.', status: 401 };
  try {
    const usuario = jwt.verify(token, process.env.JWT_SECRET);
    return { usuario, status: 200 };
  } catch (error) {
    return { error: 'Token inválido.', status: 401 };
  }
}

// Rota GET para buscar todas as mensagens de uma conversa
export async function GET(request, { params }) {
  const verificacao = verificarToken(request);
  if (verificacao.status !== 200) {
    return NextResponse.json({ error: verificacao.error }, { status: verificacao.status });
  }

  const { id: userId } = verificacao.usuario;
  const conversationId = params.conversationId;

  try {
    // Buscar a conversa e suas mensagens e verificar se ela pertence ao usuário logado
    const conversationWithMessages = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId: userId,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }, // Ordena as mensagens em ordem cronológica
        },
      },
    });

    if (!conversationWithMessages) {
      return NextResponse.json({ error: 'Conversa não encontrada ou não pertence ao usuário.' }, { status: 404 });
    }

    return NextResponse.json({ conversation: conversationWithMessages }, { status: 200 });

  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/chat/[conversationId]',
      message: 'Erro ao buscar mensagens da conversa.',
      context: { error, conversationId, userId },
    });
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}