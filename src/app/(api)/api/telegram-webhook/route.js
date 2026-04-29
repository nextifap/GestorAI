// app/api/telegram-webhook/route.js
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Groq from 'groq-sdk';
import { z } from 'zod';
import prisma from '../../../../lib/prisma';
import { saveSystemLog } from '@/lib/systemLog';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY?.trim(),
});

const triageSchema = z.object({
  needsHandover: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(3).max(240),
});

// Gera token interno para autenticar /api/chat
function getInternalToken(user) {
  const internalPayload = {
    id: user.id,
    email: user.email,
    nomeCompleto: user.nomeCompleto,
  };
  return jwt.sign(internalPayload, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function hasEscalationKeyword(message) {
  const normalized = String(message || '').toLowerCase();

  const escalationKeywords = [
    'coordenador',
    'humano',
    'atendente',
    'reclama',
    'erro grave',
    'urgente',
  ];

  return escalationKeywords.some((keyword) => normalized.includes(keyword));
}

function normalizeTriagePayload(raw) {
  const normalizedConfidence =
    typeof raw.confidence === 'number' && raw.confidence > 1 && raw.confidence <= 100
      ? raw.confidence / 100
      : raw.confidence;

  return {
    needsHandover: raw.needsHandover,
    confidence: normalizedConfidence,
    reason: String(raw.reason || '').trim(),
  };
}

function extractJson(content) {
  const trimmed = String(content || '').trim();
  if (!trimmed) {
    return null;
  }

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return null;
}

async function getTriageDecision(message) {
  const keywordEscalation = hasEscalationKeyword(message);

  if (!process.env.GROQ_API_KEY?.trim()) {
    return {
      needsHandover: keywordEscalation,
      confidence: keywordEscalation ? 0.9 : 0.55,
      reason: keywordEscalation
        ? 'Palavras-chave críticas detectadas (fallback sem NLP).'
        : 'Nenhum indício forte de escalonamento (fallback sem NLP).',
    };
  }

  try {
    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'Você é um classificador de triagem para suporte. Responda APENAS JSON com as chaves: needsHandover (boolean), confidence (0..1), reason (string curta). Escale quando houver urgência, reclamação grave, pedido explícito de humano, risco reputacional ou impasse.',
        },
        {
          role: 'user',
          content: `Mensagem do usuário: ${String(message || '').slice(0, 1200)}`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content || '';
    const jsonText = extractJson(content);

    if (!jsonText) {
      throw new Error('Resposta sem JSON parseável.');
    }

    const parsed = JSON.parse(jsonText);
    const validated = triageSchema.parse(normalizeTriagePayload(parsed));
    return validated;
  } catch {
    return {
      needsHandover: keywordEscalation,
      confidence: keywordEscalation ? 0.85 : 0.5,
      reason: keywordEscalation
        ? 'Fallback por palavras-chave após falha no classificador NLP.'
        : 'Fallback neutro após falha no classificador NLP.',
    };
  }
}

async function sendTelegramMessage(chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  return response;
}

// Rota GET para evitar erros 405 (Verificação do Vercel)
export async function GET() {
  return NextResponse.json({ message: 'Este é o endpoint do Webhook do Telegram. Por favor, envie uma requisição POST.' }, { status: 200 });
}

export async function POST(request) {
  try {
    if (TELEGRAM_WEBHOOK_SECRET) {
      const secretHeader = request.headers.get('x-telegram-bot-api-secret-token');
      if (secretHeader !== TELEGRAM_WEBHOOK_SECRET) {
        await saveSystemLog({
          level: 'WARN',
          source: 'api/telegram-webhook',
          message: 'Webhook Telegram rejeitado por segredo inválido.',
          context: { hasSecretHeader: Boolean(secretHeader) },
        });
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
      }
    }

    const body = await request.json();

    const incomingMessage = body?.message?.text || body?.callback_query?.data || '';

    const chatId = body?.message?.chat?.id || body?.callback_query?.message?.chat?.id || null;

    const telegramUserId = body?.message?.from?.id || body?.callback_query?.from?.id || null;

    if (!incomingMessage || !chatId || !telegramUserId) {
      await saveSystemLog({
        level: 'WARN',
        source: 'api/telegram-webhook',
        message: 'Payload Telegram incompleto.',
        context: {
          hasMessage: Boolean(incomingMessage),
          hasChatId: Boolean(chatId),
          hasTelegramUserId: Boolean(telegramUserId),
        },
      });
      return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
    }

    const normalizedTelegramId = String(telegramUserId);
    let user = await prisma.user.findUnique({ where: { telegramId: normalizedTelegramId } });
    
    if (!user) {
      const userEmail = `${normalizedTelegramId}@telegram.local`;
      const senhaDummy = `temporal-${Math.random().toString(36).substring(2, 15)}`;
      const senhaHash = await bcrypt.hash(senhaDummy, 10);

      user = await prisma.user.create({
        data: {
          email: userEmail,
          senha: senhaHash,
          nomeCompleto: `Usuário Telegram ${normalizedTelegramId}`,
          telegramId: normalizedTelegramId,
        },
      });
    }

    // Busca ou cria a última conversa ativa para o usuário no canal Telegram.
    let conversation = await prisma.conversation.findFirst({
      where: { userId: user.id, channel: 'telegram' },
      orderBy: { createdAt: 'desc' },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          summary: 'Conversa inicial (Telegram)',
          channel: 'telegram',
          handlingMode: 'Automatizado',
          userId: user.id,
        },
      });
    }

    const triageDecision = await getTriageDecision(incomingMessage);

    if (triageDecision.needsHandover) {
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: 'handover_pending',
          handlingMode: 'Manual',
          handoverAt: new Date(),
          handoverNote: 'Solicitação de intervenção manual detectada pela triagem NLP.',
          triageScore: triageDecision.confidence,
          triageReason: triageDecision.reason,
        },
      });
    } else {
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: 'active',
          handlingMode: 'Automatizado',
          triageScore: triageDecision.confidence,
          triageReason: triageDecision.reason,
        },
      });
    }

    const internalToken = getInternalToken(user);

    const chatResponse = await fetch(new URL('/api/chat', request.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${internalToken}`,
      },
      body: JSON.stringify({
        message: incomingMessage,
        conversationId: conversation.id,
      }),
    });

    if (!chatResponse.ok) {
      await saveSystemLog({
        level: 'ERROR',
        source: 'api/telegram-webhook',
        message: 'Erro na API interna de chat.',
        context: {
          chatStatus: chatResponse.status,
          chatId,
          conversationId: conversation.id,
          triageScore: triageDecision.confidence,
        },
      });

      await sendTelegramMessage(
        chatId,
        'Nao foi possivel processar sua solicitacao no momento. Tente novamente em instantes.',
      );
      return NextResponse.json({ error: 'Falha no processamento da conversa.' }, { status: 500 });
    }

    const result = await chatResponse.json();
    const assistantResponse = result.response || 'Não houve resposta da API de chat.';

    const telegramResponse = await sendTelegramMessage(chatId, assistantResponse);

    if (!telegramResponse.ok) {
      await saveSystemLog({
        level: 'ERROR',
        source: 'api/telegram-webhook',
        message: 'Erro ao enviar mensagem para Telegram.',
        context: { telegramStatus: telegramResponse.status, chatId },
      });
      return NextResponse.json({ error: 'Falha ao enviar mensagem ao Telegram.' }, { status: 500 });
    }

    return NextResponse.json(
      {
        chatId,
        response: assistantResponse,
        triage: {
          needsHandover: triageDecision.needsHandover,
          confidence: triageDecision.confidence,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/telegram-webhook',
      message: 'Erro no webhook do Telegram.',
      context: {
        errorMessage: error instanceof Error ? error.message : 'Erro desconhecido',
      },
    });
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}