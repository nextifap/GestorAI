import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { verifyRequestToken } from '@/lib/auth';
import { saveSystemLog } from '@/lib/systemLog';

export async function GET(request) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return NextResponse.json({ error: verificacao.error }, { status: verificacao.status });
  }

  const { id: userId } = verificacao.usuario;

  try {
    const contacts = await prisma.contact.findMany({
      where: {
        userId,
        OR: [
          { deleted: null },
          { deleted: 0 }
        ]
      },
      orderBy: { name: 'desc' }
    });

    return NextResponse.json({ contacts }, { status: 200 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/handover/queue',
      message: 'Erro ao buscar contact.',
      context: { error, userId },
    });

    return NextResponse.json({ error: 'Erro ao buscar Contatos.' }, { status: 500 });
  }
}