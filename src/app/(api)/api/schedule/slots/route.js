import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyRequestToken } from '@/lib/auth';
import { saveSystemLog } from '@/lib/systemLog';
import { validateScheduleInput, parseIsoDateOnly, toIsoDateOnly, getTodayIsoDate } from '@/lib/schedule';

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
    return NextResponse.json({ error: verificacao.error }, { status: verificacao.status });
  }

  const { id: managerId } = verificacao.usuario;

  try {
    const range = buildDateRange(new URL(request.url).searchParams);
    if (!range) {
      return NextResponse.json({ error: 'Parâmetros de data inválidos.' }, { status: 400 });
    }

    const slots = await prisma.managerScheduleSlot.findMany({
      where: {
        managerId,
        date: {
          gte: range.fromDate,
          lte: range.toDate,
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
      })),
    }, { status: 200 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/schedule/slots',
      message: 'Erro ao buscar slots da agenda.',
      context: { error, managerId },
    });

    return NextResponse.json({ error: 'Erro ao buscar agenda.' }, { status: 500 });
  }
}

export async function POST(request) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return NextResponse.json({ error: verificacao.error }, { status: verificacao.status });
  }

  const { id: managerId } = verificacao.usuario;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const validation = validateScheduleInput({ date: body?.date, hour: body?.hour });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
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

    return NextResponse.json({ error: 'Erro ao salvar slot da agenda.' }, { status: 500 });
  }
}
