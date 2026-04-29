// app/api/chat/route.js
import prisma from '@/lib/prisma';
import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';
import { saveSystemLog } from '@/lib/systemLog';
import { verifyRequestToken } from '@/lib/auth';
import { getAcademicContextForPrompt } from '@/lib/academicContext';
import {
  parseAppointmentRequestFromText,
  parseIsoDateOnly,
  toIsoDateOnly,
  validateScheduleInput,
  formatSlotPtBr,
} from '@/lib/schedule';
import { resolveManagerUserId } from '@/lib/manager';

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

async function resolveScheduleCommand({ userMessage, userId, conversation }) {
  const managerId = await resolveManagerUserId(userId);
  const wantsAvailability = hasAvailabilityIntent(userMessage);
  const wantsAppointment = hasAppointmentRequestIntent(userMessage);

  if (!wantsAvailability && !wantsAppointment) {
    return null;
  }

  if (wantsAppointment) {
    const extracted = parseAppointmentRequestFromText(userMessage);

    if (!extracted) {
      return 'Para solicitar um agendamento, envie a data e a hora. Exemplo: 30/04/2026 às 16h.';
    }

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
      select: { isAvailable: true },
    });

    if (existingSlot && !existingSlot.isAvailable) {
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
  const extracted = parseAppointmentRequestFromText(userMessage);
  if (extracted?.date) {
    targetDate = parseIsoDateOnly(extracted.date);
  }

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

// Rota GET para evitar erro 405
export async function GET() {
  return NextResponse.json(
    { message: 'Rota de chat aceita apenas requisições POST.' }, 
    { status: 405 }
  );
}

// Rota POST
export async function POST(req) {
  // Verifica JWT
  const verificacao = verifyRequestToken(req);
  if (verificacao.status !== 200) {
    return NextResponse.json({ error: verificacao.error }, { status: verificacao.status });
  }

  const { id: userId } = verificacao.usuario;

  // Lê body
  let conversationId, userMessage;
  try {
    const body = await req.json();

    // Aceita ambos campos: message ou userMessage
    conversationId = body.conversationId;
    userMessage = body.userMessage || body.message;
  } catch (error) {
    return NextResponse.json(
      { message: 'Erro 400: O corpo da requisição não é um JSON válido.' },
      { status: 400 }
    );
  }

  // Validação
  if (!conversationId || !userMessage) {
    return NextResponse.json(
      { message: 'Erro 400: Faltando conversationId ou userMessage/message.' },
      { status: 400 }
    );
  }

  try {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!conversation) {
      return NextResponse.json({ message: 'Conversa não encontrada para este usuário.' }, { status: 404 });
    }

    // Salva mensagem do usuário
    await prisma.chatMessage.create({
      data: {
        conversationId,
        text: userMessage,
        sender: 'user',
      },
    });

    if (conversation.status === 'handover_pending' || conversation.status === 'handover_in_progress') {
      return NextResponse.json(
        {
          response: 'Seu atendimento está em revisão manual pelo coordenador. Retornaremos em breve.',
          handover: true,
        },
        { status: 200 },
      );
    }

    const scheduleResponse = await resolveScheduleCommand({
      userMessage,
      userId,
      conversation,
    });

    if (scheduleResponse) {
      await prisma.chatMessage.create({
        data: {
          conversationId,
          text: scheduleResponse,
          sender: 'assistant',
        },
      });

      return NextResponse.json({ response: scheduleResponse }, { status: 200 });
    }

    // Limita o contexto para as últimas 10 mensagens (Performance)
    const messages = await prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' }, 
      take: 10, 
    });

    // Formata mensagens para Groq (inverte a ordem para cronologia correta)
    const chatMessages = messages.reverse().map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.text,
    }));
    
    // --- CORREÇÃO: Usar 'timeZone' em vez de 'timeZoneName' ---
    
    // 1. Obtém a data e hora atual formatada em Português/Brasil
    const now = new Date();
    const dataHoraAtual = now.toLocaleString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      // CORREÇÃO APLICADA AQUI:
      timeZone: 'America/Sao_Paulo', // Usa a propriedade correta para o identificador
    });

    let academicContextBlock = '';
    try {
      const contextResult = await getAcademicContextForPrompt({
        prismaClient: prisma,
        groqClient: groq,
        userMessage,
      });
      academicContextBlock = contextResult.contextBlock;
    } catch (contextError) {
      await saveSystemLog({
        level: 'WARN',
        source: 'api/chat',
        message: 'Falha ao recuperar contexto acadêmico vetorial.',
        context: { contextError, conversationId, userId },
      });
    }

    const academicInstructions = academicContextBlock
      ? `\n\nContexto acadêmico recuperado da base curricular da Unifapce (ADS e SI):\n${academicContextBlock}\n\nUse esse contexto como fonte prioritária quando for pertinente à pergunta. Se houver incerteza, deixe isso explícito e evite inventar informações.`
      : '';

    // 2. Cria o conteúdo do System Prompt, incluindo a data/hora
    const systemPromptContent = `Você é o GestorAI, um assistente virtual acadêmico da Unifapce para ADS e SI. Sua função principal é responder dúvidas acadêmicas, orientar o aluno e também ajudar na organização de tarefas.

Atenção: A data e hora atual do sistema é: ${dataHoraAtual}. Utilize essa informação como sua referência temporal e responda com base nela.

Se o usuário pedir para 'criar uma tarefa', você DEVE pedir os detalhes COMPLETO da tarefa, incluindo o título, o DIA e a HORA.

Exemplo de resposta ao pedido de tarefa: 'Com certeza! Para eu criar a tarefa, qual o título, o dia e a hora que você precisa que seja feito?'

Responda sempre de forma prestativa, concisa e focada no contexto acadêmico e na produtividade.${academicInstructions}`;


    // Adiciona instrução do sistema
    chatMessages.unshift({
      role: 'system',
      content: systemPromptContent,
    });
    // --- FIM CORREÇÃO ---

    // Chamada Groq
    const chatCompletion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: chatMessages,
    });

    const assistantResponse = chatCompletion.choices[0]?.message?.content || 'Não consegui gerar uma resposta.';

    // Salva resposta do assistente
    await prisma.chatMessage.create({
      data: {
        conversationId,
        text: assistantResponse,
        sender: 'assistant',
      },
    });

    return NextResponse.json({ response: assistantResponse }, { status: 200 });

  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/chat',
      message: 'Erro interno na rota de chat.',
      context: { error, conversationId, userId },
    });
    return NextResponse.json({ message: 'Erro interno no servidor.' }, { status: 500 });
  }
}