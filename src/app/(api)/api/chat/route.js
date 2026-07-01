// app/api/chat/route.js
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { saveSystemLog } from '@/lib/systemLog';
import { getRequestToken, verifyRequestToken } from '@/lib/auth';
import { getAcademicContextForPrompt } from '@/lib/academicContext';
import { errorResponse, respondAuthError } from '@/lib/apiErrors';
import {
  parseAppointmentRequestFromText,
  parseIsoDateOnly,
  toIsoDateOnly,
  validateScheduleInput,
  formatSlotPtBr,
} from '@/lib/schedule';
import { resolveManagerUserId } from '@/lib/manager';

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

async function resolveScheduleCommand({ userMessage, userId, conversation }) {
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

    const managerId = await resolveManagerUserId(userId);

    const validation = validateScheduleInput({ date: extracted.date, hour: extracted.hour });
    if (!validation.ok) {
      return validation.error;
    }

    const appointmentResult = await createAppointmentRequest({
      requestUrl: conversation.requestUrl,
      authToken: conversation.authToken,
      managerId,
      date: validation.isoDate,
      hour: validation.hour,
      channel: conversation.channel || 'web',
      conversationId: conversation.id,
    });

    if (!appointmentResult.ok) {
      return appointmentResult.message;
    }

    return `Solicitação registrada para ${formatSlotPtBr(validation.date, validation.hour)}. O gestor precisa aprovar ou recusar esse pedido.`;
  }

  let targetDate = null;
  if (extracted?.date) {
    targetDate = parseIsoDateOnly(extracted.date);
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
    return targetDate
      ? 'Não encontrei horários livres nessa data.'
      : 'No momento não há horários livres cadastrados na agenda do gestor.';
  }

  const lines = slots.map((slot) => `- ${formatSlotPtBr(slot.date, slot.hour)}`);
  return `Horários livres do gestor:\n${lines.join('\n')}`;
}

async function createAppointmentRequest({ requestUrl, authToken, managerId, date, hour, channel, conversationId }) {
  if (!authToken) {
    return { ok: false, message: 'Sua sessao expirou. Faca login novamente.' };
  }

  const response = await fetch(new URL('/api/appointments/requests', requestUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ managerId, date, hour, channel, conversationId }),
  });

  if (response.ok) {
    return { ok: true };
  }

  const payload = await response.json().catch(() => ({}));
  const message = payload?.error?.message || 'Nao foi possivel criar sua solicitacao. Tente novamente.';
  return { ok: false, message };
}

// Rota GET para evitar erro 405
export async function GET() {
  return errorResponse('CHAT_METHOD_NOT_ALLOWED');
}

// Rota POST
export async function POST(req) {
  // Verifica JWT
  const verificacao = verifyRequestToken(req);
  if (verificacao.status !== 200) {
    return respondAuthError(verificacao);
  }

  const { id: userId } = verificacao.usuario;
  
  var message;

  // Lê body
  let conversationId, userMessage;
  try {
    const body = await req.json();

    // Aceita ambos campos: message ou userMessage
    conversationId = body.conversationId;
    userMessage = body.userMessage || body.message;
  } catch (error) {
    return errorResponse('CHAT_BAD_JSON');
  }

  try {

    var conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId,
      },
      select: {
        id: true,
        status: true,
        telegramChatId: true,
      },
    });

    if (!conversation) {
      return errorResponse('CHAT_CONVERSATION_NOT_FOUND');
    }

    // Salva mensagem do usuário
    message = await prisma.chatMessage.create({
      data: {
        telegramStatus: "PENDING",
        conversationId,
        text: userMessage,
        sender: 'user',
      },
    });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/chat',
      message: 'Erro ao salvar mensagem do usuário.',
      context: { error, conversationId, userId },
    });
    return errorResponse('CHAT_INTERNAL_ERROR');
  }

  // Adiciona na filaa a nova mensagem para processamento assíncrono do bot (resposta rápida ao usuário)
  await prisma.messageQueue.create({
    data: {
      messageId: message.id, // Será atualizado depois que a mensagem for criada
      conversationId: conversation.id || null,
      text: userMessage,
    },
  });

  return NextResponse.json({ response: 'ok' }, { status: 200 });
}