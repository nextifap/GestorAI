import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import { saveSystemLog } from '@/lib/systemLog';
import { verifyRequestToken } from '@/lib/auth';
import { errorResponse, respondAuthError } from '@/lib/apiErrors';

export async function GET(request, { params }) {

  params = await params;

  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return respondAuthError(verificacao);
  }

  const { id: userId } = verificacao.usuario;

  try {

    const status = await prisma.telegramHealthStatus.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (!status) {
      return errorResponse('CHAT_HEALTH_STATUS_NOT_FOUND');
    }

    const now = new Date();
    const lastCheck = new Date(status.createdAt);
    const diffMinutes = Math.floor((now - lastCheck) / (1000 * 60));
    const dStaus = status.status;

    // Considera "OK" se o último check foi feito há menos de 5 minutos, senão "STALE"
    const healthStatus = diffMinutes < 5 ? status.status : "STALE";

    return NextResponse.json({ status: healthStatus, healthStatus: dStaus, lastCheck: status.updatedAt }); 

  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/chat/healthCheckStatus',
      message: 'Erro ao verificar status de saúde do servidor.',
      context: { error, userId },
    });
    return errorResponse('CHAT_INTERNAL_ERROR');
  }

  return NextResponse.json({ status: "OK" });
}