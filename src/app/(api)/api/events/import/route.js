import { NextResponse } from 'next/server';
import { parse } from 'csv-parse';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { verifyRequestToken } from '@/lib/auth';
import { saveSystemLog } from '@/lib/systemLog';
import { errorResponse, respondAuthError } from '@/lib/apiErrors';

const MAX_CSV_ROWS = 1000;
const MAX_TITLE_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 2000;
const DATE_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATE_BR_REGEX = /^\d{2}\/\d{2}\/\d{4}$/;

const eventImportSchema = z.object({
  title: z.string().trim().min(1, 'Nome do evento ausente.').max(MAX_TITLE_LENGTH, `Nome excede ${MAX_TITLE_LENGTH} caracteres.`),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH, `Descricao excede ${MAX_DESCRIPTION_LENGTH} caracteres.`).optional().nullable(),
  date: z.string().trim().min(1, 'Data ausente.'),
  time: z.string().trim().min(1, 'Horario ausente.'),
});

const NAME_HEADERS = ['nome', 'title', 'titulo'];
const DATE_HEADERS = ['data', 'date'];
const TIME_HEADERS = ['horario', 'hora', 'time'];
const DESCRIPTION_HEADERS = ['descricao', 'description', 'desc'];

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeRow(row) {
  return Object.entries(row || {}).reduce((acc, [key, value]) => {
    acc[normalizeHeader(key)] = value;
    return acc;
  }, {});
}

function getFirstValue(row, keys) {
  for (const key of keys) {
    if (typeof row[key] !== 'undefined') {
      return row[key];
    }
  }
  return '';
}

function hasCompatibleHeaders(firstRow) {
  if (!firstRow) {
    return true;
  }

  const headers = Object.keys(firstRow).map(normalizeHeader);
  const hasName = NAME_HEADERS.some((header) => headers.includes(header));
  const hasDate = DATE_HEADERS.some((header) => headers.includes(header));
  const hasTime = TIME_HEADERS.some((header) => headers.includes(header));

  return hasName && hasDate && hasTime;
}

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

export async function POST(request) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return respondAuthError(verificacao);
  }

  const { id: userId } = verificacao.usuario;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return errorResponse('EVENT_IMPORT_FILE_MISSING');
    }

    const fileContent = await file.text();
    const rows = await new Promise((resolve, reject) => {
      parse(fileContent, { columns: true, skip_empty_lines: true }, (err, records) => {
        if (err) reject(err);
        resolve(records);
      });
    });

    if (rows.length > MAX_CSV_ROWS) {
      return errorResponse('EVENT_IMPORT_TOO_MANY_ROWS', {
        message: `Arquivo muito grande. Limite de ${MAX_CSV_ROWS} linhas.`,
      });
    }

    if (!hasCompatibleHeaders(rows[0])) {
      return errorResponse('EVENT_IMPORT_HEADERS_INVALID');
    }

    const invalidRows = [];
    const newEvents = [];

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const normalized = normalizeRow(row);
      const parsed = eventImportSchema.safeParse({
        title: getFirstValue(normalized, NAME_HEADERS),
        date: getFirstValue(normalized, DATE_HEADERS),
        time: getFirstValue(normalized, TIME_HEADERS),
        description: getFirstValue(normalized, DESCRIPTION_HEADERS),
      });

      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        invalidRows.push({ row: rowNumber, reason: issue?.message || 'Linha invalida.' });
        return;
      }

      const eventDate = buildEventDate(parsed.data.date, parsed.data.time);
      if (!eventDate) {
        invalidRows.push({ row: rowNumber, reason: 'Data ou horario invalidos.' });
        return;
      }

      newEvents.push({
        title: parsed.data.title,
        description: parsed.data.description || null,
        eventDate,
        userId,
      });
    });

    if (!newEvents.length) {
      return errorResponse('EVENT_IMPORT_NO_VALID_ROWS', {
        details: { invalidRows },
      });
    }

    await prisma.campusEvent.createMany({ data: newEvents });

    return NextResponse.json({
      message: 'Planilha importada com sucesso!',
      importedCount: newEvents.length,
      invalidCount: invalidRows.length,
      invalidRows,
    }, { status: 200 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/events/import',
      message: 'Erro ao importar planilha de eventos.',
      context: { error, userId },
    });

    return errorResponse('EVENT_IMPORT_FAILED');
  }
}
