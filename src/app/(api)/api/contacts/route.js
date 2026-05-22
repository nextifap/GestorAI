import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { verifyRequestToken } from '@/lib/auth';
import { saveSystemLog } from '@/lib/systemLog';
import { errorResponse, respondAuthError } from '@/lib/apiErrors';

export async function GET(request) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return respondAuthError(verificacao);
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

    return errorResponse('CONTACTS_FETCH_FAILED');
  }
}