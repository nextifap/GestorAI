// app/api/conversations/route.js

import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import prisma from '../../../../lib/prisma';
import { saveSystemLog } from '@/lib/systemLog';

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

// Rota GET para buscar o histórico de conversas
export async function GET(request) {
  const verificacao = verificarToken(request);
  if (verificacao.status !== 200) {
    return NextResponse.json({ error: verificacao.error }, { status: verificacao.status });
  }

  const { id: userId } = verificacao.usuario;

  try {
    const conversations = await prisma.conversation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return NextResponse.json({ conversations }, { status: 200 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/conversations',
      message: 'Erro ao buscar histórico de conversas.',
      context: { error, userId },
    });
    return NextResponse.json({ error: 'Erro ao buscar histórico.' }, { status: 500 });
  }
}

// Rota POST para salvar um novo resumo de conversa
export async function POST(request) {
  const verificacao = verificarToken(request);
  if (verificacao.status !== 200) {
    return NextResponse.json({ error: verificacao.error }, { status: verificacao.status });
  }

  const { id: userId } = verificacao.usuario;
  const { summary } = await request.json();

  try {
    const newConversation = await prisma.conversation.create({
      data: {
        summary,
        userId,
      },
    });
    return NextResponse.json({ conversation: newConversation }, { status: 201 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/conversations',
      message: 'Erro ao salvar conversa.',
      context: { error, userId },
    });
    return NextResponse.json({ error: 'Erro ao salvar conversa.' }, { status: 500 });
  }
}