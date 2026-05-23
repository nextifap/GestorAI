import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyRequestToken } from '@/lib/auth';
import { saveSystemLog } from '@/lib/systemLog';
import { validateScheduleInput, toIsoDateOnly } from '@/lib/schedule';
import { errorResponse, respondAuthError } from '@/lib/apiErrors';

export async function PATCH(request, { params }) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return respondAuthError(verificacao);
  }

  const { id: managerId } = verificacao.usuario;
  const slotId = params.slotId;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('JSON_INVALID');
  }

  try {
    const existingSlot = await prisma.managerScheduleSlot.findFirst({
      where: { id: slotId, managerId },
      select: { id: true, date: true, hour: true, isAvailable: true },
    });

    if (!existingSlot) {
      return errorResponse('SCHEDULE_SLOT_NOT_FOUND');
    }

    const nextDate = body?.date || toIsoDateOnly(existingSlot.date);
    const nextHour = body?.hour ?? existingSlot.hour;
    const validation = validateScheduleInput({ date: nextDate, hour: nextHour });

    if (!validation.ok) {
      return errorResponse('SCHEDULE_VALIDATION_ERROR', { message: validation.error });
    }

    const isAvailable = typeof body?.isAvailable === 'boolean' ? body.isAvailable : existingSlot.isAvailable;

    const collision = await prisma.managerScheduleSlot.findFirst({
      where: {
        managerId,
        date: validation.date,
        hour: validation.hour,
        id: { not: slotId },
      },
      select: { id: true },
    });

    if (collision) {
      return errorResponse('SCHEDULE_SLOT_CONFLICT');
    }

    const updatedSlot = await prisma.managerScheduleSlot.update({
      where: { id: slotId },
      data: {
        date: validation.date,
        hour: validation.hour,
        isAvailable,
      },
    });

    return NextResponse.json({
      slot: {
        id: updatedSlot.id,
        date: validation.isoDate,
        hour: updatedSlot.hour,
        isAvailable: updatedSlot.isAvailable,
      },
    }, { status: 200 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/schedule/slots/[slotId]',
      message: 'Erro ao atualizar slot da agenda.',
      context: { error, managerId, slotId },
    });

    return errorResponse('SCHEDULE_SLOT_UPDATE_FAILED');
  }
}

export async function DELETE(request, { params }) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return respondAuthError(verificacao);
  }

  const { id: managerId } = verificacao.usuario;
  const slotId = params.slotId;

  try {
    const slot = await prisma.managerScheduleSlot.findFirst({
      where: { id: slotId, managerId },
      select: { id: true },
    });

    if (!slot) {
      return errorResponse('SCHEDULE_SLOT_NOT_FOUND');
    }

    const approvedCount = await prisma.appointmentRequest.count({
      where: {
        managerSlotId: slotId,
        status: 'approved',
      },
    });

    if (approvedCount > 0) {
      return errorResponse('SCHEDULE_SLOT_DELETE_CONFLICT');
    }

    await prisma.managerScheduleSlot.delete({ where: { id: slotId } });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/schedule/slots/[slotId]',
      message: 'Erro ao excluir slot da agenda.',
      context: { error, managerId, slotId },
    });

    return errorResponse('SCHEDULE_SLOT_DELETE_FAILED');
  }
}
