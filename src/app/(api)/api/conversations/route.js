// app/api/conversations/route.js

import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { saveSystemLog } from '@/lib/systemLog';
import { verifyRequestToken } from '@/lib/auth';
import conversationService from '../../services/conversationService';
import { errorResponse, respondAuthError } from '@/lib/apiErrors';

// Rota GET para buscar o histórico de conversas
export async function GET(request) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return respondAuthError(verificacao);
  }

  const params = request.nextUrl.searchParams;
  
  const { id: userId } = verificacao.usuario;
  const contactName =  params.get("contact");
  const newMessages =  params.get("newMessages") === "true";

  if (verificacao.status !== 200) {
    return NextResponse.json({ error: verificacao.error }, { status: verificacao.status });
  }

  try {
    const conversations = await conversationService.getConversations(contactName, userId, newMessages);
    return NextResponse.json({ conversations }, { status: 200 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/conversations',
      message: 'Erro ao buscar histórico de conversas.',
      context: { error, userId },
    });
    return errorResponse('CONVERSATIONS_FETCH_FAILED');
  }
}

// Rota POST para salvar um novo resumo de conversa
export async function POST(request) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return respondAuthError(verificacao);
  }

  const { id: userId } = verificacao.usuario;
  const { summary } = await request.json();

  try {
    const newConversation = await prisma.conversation.create({
      data: {
        summary,
            user: {
              connect: { id: userId }
            }
      },
    });
    return NextResponse.json({ conversation: newConversation }, { status: 201 });
  } catch (error) {
    console.log(error, `USER >>>> ${userId}`);
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/conversations',
      message: 'Erro ao salvar conversa.',
      context: { error, userId },
    });
    return errorResponse('CONVERSATION_CREATE_FAILED');
  }
}