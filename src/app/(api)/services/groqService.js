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
import agendar from "./agendarService.js";

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

async function resolveScheduleCommand(
  agendamento,
  userId,
  conversation
) {

  const hasDateTime = Boolean(agendamento?.date && Number.isFinite(agendamento?.hour));
  const wantsAvailability = agendamento.isAvailabilityQuery;
  const wantsAppointment = agendamento.isAppointmentRequest || hasDateTime;

  console.log("KAIO - 0", wantsAvailability, wantsAppointment, agendamento);
  if (!wantsAvailability && !wantsAppointment) {
    return { status: false, message: null };
  }
  console.log("KAIO - 1", agendamento);

  /**
   * =========================
   * CREATE APPOINTMENT FLOW
   * =========================
   */
  if (wantsAppointment) {

    const managerId = await resolveManagerUserId(userId);

    const validation = validateScheduleInput({
      date: agendamento.date,
      hour: agendamento.hour,
    });

    if (!validation.ok) {
      return { status: false, message: validation.error };
    }

    const appointmentResult = await agendar(userId, {
      requestUrl: conversation.requestUrl,
      authToken: conversation.authToken,
      managerId: managerId,
      date: validation.isoDate,
      hour: validation.hour,
      channel: conversation.channel || 'web',
      conversationId: conversation.id,
    });

    console.log("CAIO>>>", appointmentResult)

    if (!appointmentResult.ok) {
      return {   
        status: false,
        message: appointmentResult.message };
    }

    return {
      status: true,
      message: `Solicitação registrada para ${formatSlotPtBr(
        validation.date,
        validation.hour
      )}. O gestor precisa aprovar ou recusar esse pedido.`,
    };
  }

  /**
   * =========================
   * AVAILABILITY FLOW
   * =========================
   */

  let targetDate = null;

  if (agendamento?.date) {
    targetDate = parseIsoDateOnly(agendamento.date);
  }

  const managerId = await resolveManagerUserId(userId);

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
    return {
      status: false,
      message: targetDate
        ? 'Não encontrei horários livres nessa data.'
        : 'No momento não há horários livres cadastrados na agenda do gestor.',
    };
  }

  const lines = slots.map(
    (slot) => `- ${formatSlotPtBr(slot.date, slot.hour)}`
  );

  return {
    status: true,
    message: `Horários livres do gestor:\n${lines.join('\n')}`,
  };
}

export default {
  hasScheduleCommand: (message) => {
    return hasAvailabilityIntent(message) || hasAppointmentRequestIntent(message);
  },
  resolveScheduleCommand,
  groq
};  