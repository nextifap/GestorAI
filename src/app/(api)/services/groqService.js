import "dotenv/config";
import {
  parseAppointmentRequestFromText,
  parseIsoDateOnly,
  toIsoDateOnly,
  validateScheduleInput,
  formatSlotPtBr,
} from './../../../lib/schedule.js';
import prisma from './../../../lib/prisma.js';
import { resolveManagerUserId } from './../../../lib/manager.js';
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY?.trim(),
});

function hasAvailabilityIntent(message) {
  const normalized = String(message || '').toLowerCase();
  return [
    'horario livre',
    'horário livre',
    'horarios livres',
    'horários livres',
    'agenda',
    'disponivel',
    'disponível',
  ].some((term) => normalized.includes(term));
}

function hasAppointmentRequestIntent(message) {
  const normalized = String(message || '').toLowerCase();
  return [
    'agendar',
    'agendamento',
    'solicitar agendamento',
    'marcar horário',
    'marcar horario',
  ].some((term) => normalized.includes(term));
}

async function resolveScheduleCommand({ userMessage, userId, conversation, managerId: managerIdOverride = null }) {
  const extracted = parseAppointmentRequestFromText(userMessage);
  const hasDateTime = Boolean(extracted?.date && Number.isFinite(extracted?.hour));
  const wantsAvailability = hasAvailabilityIntent(userMessage);
  const wantsAppointment = hasAppointmentRequestIntent(userMessage) || hasDateTime;

  if (!wantsAvailability && !wantsAppointment) {
    return null;
  }

  if (wantsAppointment) {
    if (!extracted) {
      return 'Para solicitar um agendamento, envie a data e a hora. Exemplo: 30/04/2026 às 16h.';
    }

    const managerId = managerIdOverride || await resolveManagerUserId(userId);

    const validation = validateScheduleInput({ date: extracted.date, hour: extracted.hour });
    if (!validation.ok) {
      return validation.error;
    }

    const existingSlot = await prisma.managerScheduleSlot.findFirst({
      where: {
        managerId,
        date: validation.date,
        hour: validation.hour,
      },
      select: { id: true, isAvailable: true },
    });

    if (!existingSlot || !existingSlot.isAvailable) {
      return 'Esse horário não está disponível. Você pode pedir os horários livres para escolher outra opção.';
    }

    const duplicatePending = await prisma.appointmentRequest.findFirst({
      where: {
        managerId,
        requesterId: userId,
        requestedDate: validation.date,
        requestedHour: validation.hour,
        status: 'pending',
      },
      select: { id: true },
    });

    if (duplicatePending) {
      return 'Você já possui uma solicitação pendente para esse horário. Aguarde a aprovação do gestor.';
    }

    await prisma.appointmentRequest.create({
      data: {
        managerId,
        requesterId: userId,
        conversationId: conversation.id,
        requestedDate: validation.date,
        requestedHour: validation.hour,
        channel: conversation.channel || 'web',
      },
    });

    return `Solicitação registrada para ${formatSlotPtBr(validation.date, validation.hour)}. O gestor precisa aprovar ou recusar esse pedido.`;
  }

  let targetDate = null;
  if (extracted?.date) {
    targetDate = parseIsoDateOnly(extracted.date);
  }

  const managerId = managerIdOverride || await resolveManagerUserId(userId);

  const today = parseIsoDateOnly(toIsoDateOnly(new Date()));
  const whereDate = targetDate
    ? { equals: targetDate }
    : { gte: today };

  const slots = await prisma.managerScheduleSlot.findMany({
    where: {
      managerId,
      isAvailable: true,
      date: whereDate,
    },
    orderBy: [{ date: 'asc' }, { hour: 'asc' }],
    take: targetDate ? 20 : 8,
  });

  if (!slots.length) {
    return targetDate
      ? 'Não encontrei horários livres nessa data.'
      : 'No momento não há horários livres cadastrados na agenda do gestor.';
  }

  const lines = slots.map((slot) => `- ${formatSlotPtBr(slot.date, slot.hour)}`);
  return `Horários livres do gestor:\n${lines.join('\n')}`;
}

export default {
  hasScheduleCommand: (message) => {
    return hasAvailabilityIntent(message) || hasAppointmentRequestIntent(message);
  },
  resolveScheduleCommand,
  groq
};  