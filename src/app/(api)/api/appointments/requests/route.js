import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyRequestToken } from '@/lib/auth';
import { saveSystemLog } from '@/lib/systemLog';
import { toIsoDateOnly, parseIsoDateOnly, getDateBlockReason } from '@/lib/schedule';
import { errorResponse, respondAuthError } from '@/lib/apiErrors';

export async function GET(request) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return respondAuthError(verificacao);
  }

  const { id: managerId } = verificacao.usuario;

  try {
    const statusFilter = new URL(request.url).searchParams.get('status');

    const requests = await prisma.appointmentRequest.findMany({
      where: {
        managerId,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      include: {
        requester: {
          select: {
            id: true,
            nomeCompleto: true,
            email: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });

    return NextResponse.json({
      requests: requests.map((item) => ({
        id: item.id,
        status: item.status,
        date: toIsoDateOnly(item.requestedDate),
        hour: item.requestedHour,
        channel: item.channel,
        justification: item.justification,
        createdAt: item.createdAt,
        requester: item.requester,
      })),
    }, { status: 200 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/appointments/requests',
      message: 'Erro ao listar solicitações de agendamento.',
      context: { error, managerId },
    });

    return errorResponse('APPOINTMENTS_LIST_FAILED');
  }
}

export async function POST(request) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return respondAuthError(verificacao);
  }

  const requesterId = verificacao.usuario.id;

  try {
    const body = await request.json();
    const { managerId, date, hour, channel = 'web', justification = null } = body;

    if (!managerId || !date || typeof hour === 'undefined') {
      return errorResponse('APPOINTMENT_REQUEST_INVALID');
    }

    const parsedDate = parseIsoDateOnly(date);
    const parsedHour = Number(hour);

    if (!parsedDate || Number.isNaN(parsedHour) || parsedHour < 0 || parsedHour > 23) {
      return errorResponse('APPOINTMENT_DATE_OR_HOUR_INVALID');
    }

    // Verificar se o manager existe
    const manager = await prisma.usuario.findUnique({
      where: { id: managerId },
    });

    if (!manager || manager.role !== 'gestor') {
      return errorResponse('APPOINTMENT_MANAGER_NOT_FOUND');
    }

    // Verificar requester (quem faz a solicitação) não é gestor e não é o mesmo manager
    const requester = await prisma.usuario.findUnique({ where: { id: requesterId } });
    if (!requester) {
      return errorResponse('APPOINTMENT_REQUESTER_NOT_FOUND');
    }
    if (requester.role === 'gestor') {
      return errorResponse('APPOINTMENT_REQUEST_FORBIDDEN_MANAGER');
    }
    if (requester.id === managerId) {
      return errorResponse('APPOINTMENT_REQUEST_FORBIDDEN_SELF');
    }

    // Verificar se já existe uma solicitação idêntica
    const existing = await prisma.appointmentRequest.findFirst({
      where: {
        managerId,
        requesterId,
        requestedDate: parsedDate,
        requestedHour: parsedHour,
      },
    });

    if (existing) {
      return errorResponse('APPOINTMENT_DUPLICATE');
    }

    // Verificar regras de bloqueio de data (retroativo, fim de semana, feriado)
    const dateBlock = getDateBlockReason(parsedDate);
    if (dateBlock) {
      return errorResponse('APPOINTMENT_DATE_BLOCKED', { message: dateBlock });
    }

    // Verificar se já existe um slot ocupado (isAvailable = false) para esse horário
    const existingSlot = await prisma.managerScheduleSlot.findFirst({
      where: {
        managerId,
        date: parsedDate,
        hour: parsedHour,
        isAvailable: false,
      },
      select: { id: true },
    });

    if (existingSlot) {
      return errorResponse('APPOINTMENT_SLOT_UNAVAILABLE');
    }

    const created = await prisma.appointmentRequest.create({
      data: {
        managerId,
        requesterId,
        requestedDate: parsedDate,
        requestedHour: parsedHour,
        channel,
        justification,
        status: 'pending',
      },
    });

    await saveSystemLog({
      level: 'INFO',
      source: 'api/appointments/requests',
      message: 'Nova solicitação de agendamento criada.',
      context: { requestId: created.id, managerId, requesterId },
    });

    return NextResponse.json({ request: { id: created.id, status: created.status } }, { status: 201 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/appointments/requests',
      message: 'Erro ao criar solicitação de agendamento.',
      context: { error, requesterId },
    });

    return errorResponse('APPOINTMENT_CREATE_FAILED');
  }
}
