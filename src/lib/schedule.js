import Holidays from 'date-holidays';

const START_HOUR = 14;
const END_HOUR = 22;
// Timezone de Juazeiro do Norte - Ceará
const BUSINESS_TIMEZONE = 'America/Fortaleza';
// Feriados do Ceará (BR-CE)
const brazilHolidays = new Holidays('BR-CE');

// Feriados municipais específicos de Juazeiro do Norte (mês-dia)
// Ref: Lei Municipal de Juazeiro do Norte
const JUAZEIRO_MUNICIPAL_HOLIDAYS = [
  '08-06', // Festa de Nossa Senhora das Dores (Padroeira) - 6 de agosto
];

function toDateOnlyUtc(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function getDatePartsInTimeZone(dateLike, timeZone = BUSINESS_TIMEZONE) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    return null;
  }

  return { year, month, day };
}

export function getTodayIsoDate(timeZone = BUSINESS_TIMEZONE, referenceDate = new Date()) {
  const parts = getDatePartsInTimeZone(referenceDate, timeZone);
  if (!parts) {
    return null;
  }

  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Mapa de nomes de feriados municipais de Juazeiro do Norte
const JUAZEIRO_HOLIDAY_NAMES = {
  '08-06': 'Festa de Nossa Senhora das Dores',
};

export function getHolidayName(dateLike) {
  const normalized = dateLike instanceof Date ? dateLike : parseIsoDateOnly(dateLike);
  if (!normalized) {
    return null;
  }

  const parts = getDatePartsInTimeZone(normalized);
  if (!parts) {
    return null;
  }

  const monthDay = `${parts.month}-${parts.day}`;
  if (JUAZEIRO_HOLIDAY_NAMES[monthDay]) {
    return JUAZEIRO_HOLIDAY_NAMES[monthDay];
  }

  // Verifica feriados estaduais/nacionais
  const holidayDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12));
  const stateHolidays = brazilHolidays.getHolidays(Number(parts.year)).filter((h) => {
    const hDate = new Date(h.start);
    return hDate.getUTCMonth() === Number(parts.month) - 1 && hDate.getUTCDate() === Number(parts.day);
  });

  if (stateHolidays.length > 0) {
    return stateHolidays[0].name;
  }

  return null;
}

export function isHolidayDate(dateLike) {
  const normalized = dateLike instanceof Date ? dateLike : parseIsoDateOnly(dateLike);
  if (!normalized) {
    return false;
  }

  const parts = getDatePartsInTimeZone(normalized);
  if (!parts) {
    return false;
  }

  // Verifica feriados estaduais/nacionais
  const holidayDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12));
  if (brazilHolidays.isHoliday(holidayDate)) {
    return true;
  }

  // Verifica feriados municipais de Juazeiro do Norte (apenas mês-dia)
  const monthDay = `${parts.month}-${parts.day}`;
  if (JUAZEIRO_MUNICIPAL_HOLIDAYS.includes(monthDay)) {
    return true;
  }

  return false;
}

export function getDateBlockReason(dateLike, referenceDate = new Date()) {
  const normalizedDate = dateLike instanceof Date ? dateLike : parseIsoDateOnly(dateLike);
  if (!normalizedDate) {
    return 'Data inválida. Use o formato YYYY-MM-DD.';
  }

  const todayIso = getTodayIsoDate(BUSINESS_TIMEZONE, referenceDate);
  const targetIso = toIsoDateOnly(normalizedDate);

  if (todayIso && targetIso && targetIso < todayIso) {
    return 'Não é permitido agendar datas retroativas.';
  }

  if (!isBusinessDay(normalizedDate)) {
    return 'A agenda permite apenas dias úteis (segunda a sexta).';
  }

  if (isHolidayDate(normalizedDate)) {
    const holidayName = getHolidayName(normalizedDate);
    return holidayName
      ? `Não é permitido agendar em feriados. Data bloqueada: ${holidayName}.`
      : 'Não é permitido agendar em feriados.';
  }

  return null;
}

export function parseIsoDateOnly(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }

  const [year, month, day] = text.split('-').map(Number);
  const normalized = new Date(Date.UTC(year, month - 1, day));
  if (
    normalized.getUTCFullYear() !== year
    || normalized.getUTCMonth() !== month - 1
    || normalized.getUTCDate() !== day
  ) {
    return null;
  }

  return normalized;
}

export function toIsoDateOnly(dateLike) {
  const normalized = toDateOnlyUtc(dateLike);
  if (!normalized) {
    return null;
  }

  return normalized.toISOString().slice(0, 10);
}

export function isBusinessDay(dateLike) {
  const normalized = toDateOnlyUtc(dateLike);
  if (!normalized) {
    return false;
  }

  const dayOfWeek = normalized.getUTCDay();
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

export function isAllowedHour(hour) {
  const parsed = Number(hour);
  return Number.isInteger(parsed) && parsed >= START_HOUR && parsed <= END_HOUR;
}

export function validateScheduleInput({ date, hour }) {
  const normalizedDate = parseIsoDateOnly(date);
  const parsedHour = Number.parseInt(String(hour), 10);

  if (!normalizedDate) {
    return { ok: false, error: 'Data inválida. Use o formato YYYY-MM-DD.' };
  }

  const dateBlockReason = getDateBlockReason(normalizedDate);
  if (dateBlockReason) {
    return { ok: false, error: dateBlockReason };
  }

  if (!isAllowedHour(parsedHour)) {
    return { ok: false, error: `Horário inválido. Use horários entre ${START_HOUR}h e ${END_HOUR}h.` };
  }

  return {
    ok: true,
    date: normalizedDate,
    hour: parsedHour,
    isoDate: toIsoDateOnly(normalizedDate),
  };
}

export function parseAppointmentRequestFromText(text, now = new Date()) {
  const value = String(text || '').toLowerCase();
  const hourMatch = value.match(/\b([01]?\d|2[0-3])\s*(?:h|:\s*00)?\b/);
  const isoMatch = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const brMatch = value.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);

  let parsedDate = null;

  if (isoMatch) {
    parsedDate = parseIsoDateOnly(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`);
  } else if (brMatch) {
    const day = Number(brMatch[1]);
    const month = Number(brMatch[2]);
    const yearRaw = brMatch[3];
    const year = yearRaw
      ? (yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw))
      : now.getFullYear();

    parsedDate = parseIsoDateOnly(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }

  if (!parsedDate || !hourMatch) {
    return null;
  }

  return {
    date: toIsoDateOnly(parsedDate),
    hour: Number(hourMatch[1]),
  };
}

export function formatDateDDMMYYYY(dateLike) {
  const normalized = dateLike instanceof Date ? dateLike : parseIsoDateOnly(dateLike);
  if (!normalized) {
    return '';
  }

  const parts = getDatePartsInTimeZone(normalized, BUSINESS_TIMEZONE);
  if (!parts) {
    return '';
  }

  return `${parts.day}/${parts.month}/${parts.year}`;
}

export function formatSlotPtBr(dateLike, hour) {
  const date = new Date(dateLike);
  const dateText = date.toLocaleDateString('pt-BR', {
    timeZone: BUSINESS_TIMEZONE,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const formatted = formatDateDDMMYYYY(dateLike);
  return `${dateText} (${formatted}), ${String(hour).padStart(2, '0')}:00`;
}

export function getSlotAvailabilityLabel({ date, hour, isAvailable }) {
  const dateBlockReason = getDateBlockReason(date);
  if (dateBlockReason) {
    return dateBlockReason;
  }

  if (Number.isInteger(Number(hour))) {
    if (Number(hour) < START_HOUR || Number(hour) > END_HOUR) {
      return `Horário fora da faixa de ${START_HOUR}h às ${END_HOUR}h.`;
    }
  }

  if (isAvailable === false) {
    return 'Horário já ocupado.';
  }

  return 'Horário livre.';
}

export const scheduleLimits = {
  startHour: START_HOUR,
  endHour: END_HOUR,
};
