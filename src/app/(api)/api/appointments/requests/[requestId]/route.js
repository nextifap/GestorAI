import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyRequestToken } from '@/lib/auth';
import { saveSystemLog } from '@/lib/systemLog';
import { getDateBlockReason, toIsoDateOnly } from '@/lib/schedule';
import { errorResponse, respondAuthError } from '@/lib/apiErrors';

export async function PATCH(request, { params }) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return respondAuthError(verificacao);
  }

  const { id: managerId } = verificacao.usuario;
  const requestId = params.requestId;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('JSON_INVALID');
  }

  const action = String(body?.action || '').trim().toLowerCase();
  const justification = String(body?.justification || '').trim();

  if (action !== 'approve' && action !== 'reject') {
    return errorResponse('APPOINTMENT_ACTION_INVALID');
  }

  if (action === 'reject' && !justification) {
    return errorResponse('APPOINTMENT_REJECT_REASON_REQUIRED');
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
      return errorResponse('APPOINTMENT_NOT_FOUND');
    }

    if (appointmentRequest.status !== 'pending') {
      return errorResponse('APPOINTMENT_ALREADY_PROCESSED');
    }

    var rejected;
    if (action === 'reject') {
      rejected = await prisma.appointmentRequest.update({
        where: { id: requestId },
        data: {
          status: 'rejected',
          justification,
        },
        select: {
          id: true,
          status: true,
          conversation: {
            select: {
              telegramChatId: true,
            },
          },
        }
      });

      // Adiciona na filaa a nova mensagem para processamento assíncrono do bot (resposta rápida ao usuário)
      await prisma.messageQueue.create({
        data: {
          chatId: rejected.conversation.telegramChatId || null,
          text: "Sua solicitação de agendamento foi recusada pelo gestor. Justificativa: " + justification,
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
      return errorResponse('APPOINTMENT_DATE_BLOCKED', { message: dateBlockReason });
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
      return errorResponse('APPOINTMENT_APPROVAL_CONFLICT');
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
      select: {
          id: true,
          status: true,
          conversation: {
            select: {
              telegramChatId: true,
            },
          },
        }
    });

    // Adiciona na filaa a nova mensagem para processamento assíncrono do bot (resposta rápida ao usuário)
    await prisma.messageQueue.create({
      data: {
        chatId: approved.conversation.telegramChatId || null,
        text: "Sua solicitação de agendamento foi aprovada pelo gestor.",
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

    return errorResponse('APPOINTMENT_PROCESS_FAILED');
  }
}
