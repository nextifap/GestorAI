import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyRequestToken } from '@/lib/auth';
import { saveSystemLog } from '@/lib/systemLog';
import { validateScheduleInput, parseIsoDateOnly, toIsoDateOnly, getTodayIsoDate } from '@/lib/schedule';
import { errorResponse, respondAuthError } from '@/lib/apiErrors';

function buildDateRange(searchParams) {
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const todayIso = getTodayIsoDate();

  const requestedFromDate = parseIsoDateOnly(fromParam);
  const todayDate = todayIso ? parseIsoDateOnly(todayIso) : null;
  let fromDateOnly = requestedFromDate || todayDate;

  if (requestedFromDate && todayDate && requestedFromDate < todayDate) {
    fromDateOnly = todayDate;
  }
  if (!fromDateOnly) {
    return null;
  }

  const toDate = parseIsoDateOnly(toParam)
    || new Date(fromDateOnly.getTime() + 30 * 24 * 60 * 60 * 1000);

  if (!toDate) {
    return null;
  }

  return { fromDate: fromDateOnly, toDate };
}

export async function GET(request) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return respondAuthError(verificacao);
  }

  const { id: managerId } = verificacao.usuario;

  try {
    const range = buildDateRange(new URL(request.url).searchParams);
    if (!range) {
      return errorResponse('SCHEDULE_DATE_RANGE_INVALID');
    }

    const slots = await prisma.managerScheduleSlot.findMany({
      where: {
        managerId,
        date: {
          gte: range.fromDate,
          lte: range.toDate,
        },
      },
      select: {
        id: true,
        date: true,
        hour: true,
        isAvailable: true,
        appointmentRequests: {
          select: {
            id: true,
            requesterId: true,
            requester: {
              select: {
                id: true,
                name: true
              },
            }
          },
        },
      },
      orderBy: [{ date: 'asc' }, { hour: 'asc' }],
    });

    return NextResponse.json({
      slots: slots.map((slot) => ({
        id: slot.id,
        date: toIsoDateOnly(slot.date),
        hour: slot.hour,
        isAvailable: slot.isAvailable,
        requester: slot.appointmentRequests.length > 0
          ? {
              id: slot.appointmentRequests[0].requesterId,
              nomeCompleto: slot.appointmentRequests[0].requester.name
            }
          : null, 
      })),
    }, { status: 200 });
  } catch (error) {
    console.error('Erro ao buscar slots da agenda:', error);
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/schedule/slots',
      message: 'Erro ao buscar slots da agenda.',
      context: { error, managerId },
    });

    return errorResponse('SCHEDULE_FETCH_FAILED');
  }
}

export async function POST(request) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return respondAuthError(verificacao);
  }

  const { id: managerId } = verificacao.usuario;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('JSON_INVALID');
  }

  const validation = validateScheduleInput({ date: body?.date, hour: body?.hour });
  if (!validation.ok) {
    return errorResponse('SCHEDULE_VALIDATION_ERROR', { message: validation.error });
  }

  const isAvailable = body?.isAvailable !== false;

  try {
    const slot = await prisma.managerScheduleSlot.upsert({
      where: {
        managerId_date_hour: {
          managerId,
          date: validation.date,
          hour: validation.hour,
        },
      },
      update: {
        isAvailable,
      },
      create: {
        managerId,
        date: validation.date,
        hour: validation.hour,
        isAvailable,
      },
    });

    return NextResponse.json({
      slot: {
        id: slot.id,
        date: validation.isoDate,
        hour: slot.hour,
        isAvailable: slot.isAvailable,
      },
    }, { status: 201 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/schedule/slots',
      message: 'Erro ao cadastrar slot da agenda.',
      context: { error, managerId },
    });

    return errorResponse('SCHEDULE_SLOT_SAVE_FAILED');
  }
}
