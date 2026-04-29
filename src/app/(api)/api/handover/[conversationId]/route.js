import { NextResponse } from 'next/server';
import prisma from '../../../../../../lib/prisma';
import { verifyRequestToken } from '@/lib/auth';
import { saveSystemLog } from '@/lib/systemLog';

const ALLOWED_STATUS = new Set(['active', 'handover_pending', 'handover_in_progress', 'resolved']);

export async function PATCH(request, { params }) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return NextResponse.json({ error: verificacao.error }, { status: verificacao.status });
  }

  const { id: userId } = verificacao.usuario;
  const { conversationId } = params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const status = String(body?.status || '').trim();
  const handoverNote = body?.handoverNote ? String(body.handoverNote).trim() : null;

  if (!ALLOWED_STATUS.has(status)) {
    return NextResponse.json({ error: 'Status inválido para handover.' }, { status: 400 });
  }

  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
    }

    const updatedConversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status,
        handlingMode: status === 'active' ? 'Automatizado' : 'Manual',
        handoverNote,
        handoverAt: status === 'active' ? null : new Date(),
      },
    });

    return NextResponse.json({ conversation: updatedConversation }, { status: 200 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/handover/[conversationId]',
      message: 'Erro ao atualizar status de handover.',
      context: { error, userId, conversationId },
    });

    return NextResponse.json({ error: 'Erro ao atualizar handover.' }, { status: 500 });
  }
}
