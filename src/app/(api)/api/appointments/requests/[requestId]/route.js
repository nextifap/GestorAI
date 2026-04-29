import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyRequestToken } from '@/lib/auth';
import { saveSystemLog } from '@/lib/systemLog';
import { getDateBlockReason, toIsoDateOnly } from '@/lib/schedule';

export async function PATCH(request, { params }) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return NextResponse.json({ error: verificacao.error }, { status: verificacao.status });
  }

  const { id: managerId } = verificacao.usuario;
  const requestId = params.requestId;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const action = String(body?.action || '').trim().toLowerCase();
  const justification = String(body?.justification || '').trim();

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  }

  if (action === 'reject' && !justification) {
    return NextResponse.json({ error: 'Justificativa é obrigatória para recusa.' }, { status: 400 });
  }

  try {
    const appointmentRequest = await prisma.appointmentRequest.findFirst({
      where: { id: requestId, managerId },
      select: {
        id: true,
        status: true,
        requestedDate: true,
        requestedHour: true,
      },
    });

    if (!appointmentRequest) {
      return NextResponse.json({ error: 'Solicitação não encontrada.' }, { status: 404 });
    }

    if (appointmentRequest.status !== 'pending') {
      return NextResponse.json({ error: 'Solicitação já foi processada.' }, { status: 409 });
    }

    if (action === 'reject') {
      const rejected = await prisma.appointmentRequest.update({
        where: { id: requestId },
        data: {
          status: 'rejected',
          justification,
        },
      });

      return NextResponse.json({
        request: {
          id: rejected.id,
          status: rejected.status,
          date: toIsoDateOnly(rejected.requestedDate),
          hour: rejected.requestedHour,
          justification: rejected.justification,
        },
      }, { status: 200 });
    }

    const dateBlockReason = getDateBlockReason(appointmentRequest.requestedDate);
    if (dateBlockReason) {
      return NextResponse.json({ error: dateBlockReason }, { status: 409 });
    }

    const existingSlot = await prisma.managerScheduleSlot.findFirst({
      where: {
        managerId,
        date: appointmentRequest.requestedDate,
        hour: appointmentRequest.requestedHour,
      },
      select: {
        id: true,
        isAvailable: true,
      },
    });

    if (existingSlot && !existingSlot.isAvailable) {
      return NextResponse.json(
        { error: 'Esse horário já está indisponível e não pode ser aprovado.' },
        { status: 409 },
      );
    }

    const slot = await prisma.managerScheduleSlot.upsert({
      where: {
        managerId_date_hour: {
          managerId,
          date: appointmentRequest.requestedDate,
          hour: appointmentRequest.requestedHour,
        },
      },
      create: {
        managerId,
        date: appointmentRequest.requestedDate,
        hour: appointmentRequest.requestedHour,
        isAvailable: false,
      },
      update: {
        isAvailable: false,
      },
    });

    const approved = await prisma.appointmentRequest.update({
      where: { id: requestId },
      data: {
        status: 'approved',
        managerSlotId: slot.id,
        justification: null,
      },
    });

    return NextResponse.json({
      request: {
        id: approved.id,
        status: approved.status,
        date: toIsoDateOnly(approved.requestedDate),
        hour: approved.requestedHour,
      },
    }, { status: 200 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/appointments/requests/[requestId]',
      message: 'Erro ao atualizar solicitação de agendamento.',
      context: { error, managerId, requestId, action },
    });

    return NextResponse.json({ error: 'Erro ao processar solicitação.' }, { status: 500 });
  }
}
