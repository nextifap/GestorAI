// app/api/chat/route.js
import prisma from '@/lib/prisma';
import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { saveSystemLog } from '@/lib/systemLog';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY?.trim(),
});

// Função para verificar JWT
function verificarToken(request) {
  const token = request.headers.get('authorization')?.split(' ')[1];
  if (!token) return { error: 'Token não fornecido.', status: 401 };

  try {
    const usuario = jwt.verify(token, process.env.JWT_SECRET);
    return { usuario, status: 200 };
  } catch (error) {
    return { error: 'Token inválido.', status: 401 };
  }
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
  const verificacao = verificarToken(req);
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
    // Salva mensagem do usuário
    await prisma.chatMessage.create({
      data: {
        conversationId,
        text: userMessage,
        sender: 'user',
      },
    });

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

    // 2. Cria o conteúdo do System Prompt, incluindo a data/hora
    const systemPromptContent = `Você é o GestorAI, um assistente virtual de produtividade. Sua função principal é ajudar o usuário a organizar tarefas e responder dúvidas.

Atenção: A data e hora atual do sistema é: ${dataHoraAtual}. Utilize essa informação como sua referência temporal e responda com base nela.

Se o usuário pedir para 'criar uma tarefa', você DEVE pedir os detalhes COMPLETO da tarefa, incluindo o título, o DIA e a HORA.

Exemplo de resposta ao pedido de tarefa: 'Com certeza! Para eu criar a tarefa, qual o título, o dia e a hora que você precisa que seja feito?'

Responda sempre de forma prestativa, concisa e focada na produtividade.`;


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