import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import { verifyRequestToken } from '@/lib/auth';
import { saveSystemLog } from '@/lib/systemLog';

export async function GET(request) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return NextResponse.json({ error: verificacao.error }, { status: verificacao.status });
  }

  const { id: userId } = verificacao.usuario;

  try {
    const queue = await prisma.conversation.findMany({
      where: {
        userId,
        channel: 'telegram',
        status: 'handover_pending',
      },
      orderBy: { createdAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
      take: 25,
    });

    return NextResponse.json({ queue }, { status: 200 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/handover/queue',
      message: 'Erro ao buscar fila de handover.',
      context: { error, userId },
    });

    return NextResponse.json({ error: 'Erro ao buscar fila de handover.' }, { status: 500 });
  }
}
