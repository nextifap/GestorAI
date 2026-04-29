import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyRequestToken } from '@/lib/auth';
import { saveSystemLog } from '@/lib/systemLog';
import { validateScheduleInput, toIsoDateOnly } from '@/lib/schedule';

export async function PATCH(request, { params }) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return NextResponse.json({ error: verificacao.error }, { status: verificacao.status });
  }

  const { id: managerId } = verificacao.usuario;
  const slotId = params.slotId;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  try {
    const existingSlot = await prisma.managerScheduleSlot.findFirst({
      where: { id: slotId, managerId },
      select: { id: true, date: true, hour: true, isAvailable: true },
    });

    if (!existingSlot) {
      return NextResponse.json({ error: 'Slot não encontrado.' }, { status: 404 });
    }

    const nextDate = body?.date || toIsoDateOnly(existingSlot.date);
    const nextHour = body?.hour ?? existingSlot.hour;
    const validation = validateScheduleInput({ date: nextDate, hour: nextHour });

    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
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
      return NextResponse.json({ error: 'Já existe um slot nesse horário.' }, { status: 409 });
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

    return NextResponse.json({ error: 'Erro ao atualizar slot.' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return NextResponse.json({ error: verificacao.error }, { status: verificacao.status });
  }

  const { id: managerId } = verificacao.usuario;
  const slotId = params.slotId;

  try {
    const slot = await prisma.managerScheduleSlot.findFirst({
      where: { id: slotId, managerId },
      select: { id: true },
    });

    if (!slot) {
      return NextResponse.json({ error: 'Slot não encontrado.' }, { status: 404 });
    }

    const approvedCount = await prisma.appointmentRequest.count({
      where: {
        managerSlotId: slotId,
        status: 'approved',
      },
    });

    if (approvedCount > 0) {
      return NextResponse.json(
        { error: 'Não é possível excluir slot com agendamento aprovado.' },
        { status: 409 },
      );
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

    return NextResponse.json({ error: 'Erro ao excluir slot.' }, { status: 500 });
  }
}
