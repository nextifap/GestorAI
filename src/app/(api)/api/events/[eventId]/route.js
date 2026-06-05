import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { verifyRequestToken } from '@/lib/auth';
import { saveSystemLog } from '@/lib/systemLog';
import { errorResponse, respondAuthError } from '@/lib/apiErrors';

const MAX_TITLE_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 2000;
const DATE_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATE_BR_REGEX = /^\d{2}\/\d{2}\/\d{4}$/;

const eventSchema = z.object({
  title: z.string().trim().min(1, 'Nome do evento ausente.').max(MAX_TITLE_LENGTH, `Nome excede ${MAX_TITLE_LENGTH} caracteres.`),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH, `Descricao excede ${MAX_DESCRIPTION_LENGTH} caracteres.`).optional().nullable(),
  date: z.string().trim().min(1, 'Data ausente.'),
  time: z.string().trim().min(1, 'Horario ausente.'),
});

function parseDateString(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  let year;
  let month;
  let day;

  if (DATE_ISO_REGEX.test(raw)) {
    [year, month, day] = raw.split('-').map(Number);
  } else if (DATE_BR_REGEX.test(raw)) {
    [day, month, year] = raw.split('/').map(Number);
  } else {
    return null;
  }

  if (!year || !month || !day) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return { year, month, day };
}

function parseTimeString(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2] || '0');

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return { hour, minute };
}

function buildEventDate(dateValue, timeValue) {
  const dateParts = parseDateString(dateValue);
  const timeParts = parseTimeString(timeValue);

  if (!dateParts || !timeParts) {
    return null;
  }

  const eventDate = new Date(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute,
    0,
    0,
  );

  if (Number.isNaN(eventDate.getTime())) {
    return null;
  }

  return eventDate;
}

function toEventResponse(event) {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    eventDate: event.eventDate,
  };
}

export async function PATCH(request, { params }) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return respondAuthError(verificacao);
  }

  const { id: userId } = verificacao.usuario;
  const eventId = params.eventId;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('JSON_INVALID');
  }

  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return errorResponse('EVENT_VALIDATION_FAILED', { message: issue?.message });
  }

  const eventDate = buildEventDate(parsed.data.date, parsed.data.time);
  if (!eventDate) {
    return errorResponse('EVENT_VALIDATION_FAILED', { message: 'Data ou horario invalidos.' });
  }

  try {
    const existing = await prisma.campusEvent.findFirst({
      where: { id: eventId, userId },
      select: { id: true },
    });

    if (!existing) {
      return errorResponse('EVENT_NOT_FOUND');
    }

    const updated = await prisma.campusEvent.update({
      where: { id: eventId },
      data: {
        title: parsed.data.title,
        description: parsed.data.description || null,
        eventDate,
      },
    });

    return NextResponse.json({ event: toEventResponse(updated) }, { status: 200 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/events/[eventId]',
      message: 'Erro ao atualizar evento.',
      context: { error, userId, eventId },
    });

    return errorResponse('EVENT_UPDATE_FAILED');
  }
}

export async function DELETE(request, { params }) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return respondAuthError(verificacao);
  }

  const { id: userId } = verificacao.usuario;
  const eventId = params.eventId;

  try {
    const existing = await prisma.campusEvent.findFirst({
      where: { id: eventId, userId },
      select: { id: true },
    });

    if (!existing) {
      return errorResponse('EVENT_NOT_FOUND');
    }

    await prisma.campusEvent.delete({ where: { id: eventId } });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/events/[eventId]',
      message: 'Erro ao excluir evento.',
      context: { error, userId, eventId },
    });

    return errorResponse('EVENT_DELETE_FAILED');
  }
}
