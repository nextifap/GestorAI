import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findFirst: vi.fn() },
    contact: { upsert: vi.fn() },
    conversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    chatMessage: { create: vi.fn(), findMany: vi.fn() },
  },
}));

const { groqServiceMock, eventServiceMock, handoverMock, academicContextMock } = vi.hoisted(() => ({
  groqServiceMock: {
    resolveScheduleCommand: vi.fn(),
    hasScheduleCommand: vi.fn(),
    groq: { chat: { completions: { create: vi.fn() } } },
  },
  eventServiceMock: {
    hasEventQueryIntent: vi.fn(),
    resolveEventQuery: vi.fn(),
  },
  handoverMock: {
    checkInterventionRequired: vi.fn(),
  },
  academicContextMock: {
    getAcademicContextForPrompt: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ default: prismaMock }));
vi.mock('@/app/(api)/services/groqService.js', () => ({ default: groqServiceMock }));
vi.mock('@/app/(api)/services/eventService.js', () => ({ default: eventServiceMock }));
vi.mock('@/app/(api)/services/handover.js', () => ({
  checkInterventionRequired: handoverMock.checkInterventionRequired,
}));
vi.mock('@/lib/academicContext.js', () => ({
  getAcademicContextForPrompt: academicContextMock.getAcademicContextForPrompt,
}));

import ConversationService from '@/app/(api)/services/conversationService.js';

const TELEGRAM_CHAT_ID = 12345;

function buildBody(text) {
  return {
    text,
    nome: 'Aluno Teste',
    telefone: '5511999999999',
    chatId: TELEGRAM_CHAT_ID,
    accessHash: 'hash-123',
  };
}

function setupHappyPath({ status = 'open' } = {}) {
  prismaMock.user.findFirst.mockResolvedValue({ id: 'admin-1' });
  prismaMock.contact.upsert.mockResolvedValue({ id: 'contact-1' });
  prismaMock.conversation.findFirst.mockResolvedValue({
    id: 'conv-1',
    status,
    telegramChatId: TELEGRAM_CHAT_ID,
    messages: [],
  });
  prismaMock.conversation.update.mockResolvedValue({
    id: 'conv-1',
    status,
    telegramChatId: TELEGRAM_CHAT_ID,
  });
  prismaMock.chatMessage.create.mockResolvedValue({ id: 'msg-1' });
  handoverMock.checkInterventionRequired.mockResolvedValue({ status });
  // Sem intenção de agendamento.
  groqServiceMock.groq.chat.completions.create.mockResolvedValue({
    choices: [{ message: { content: '{}' } }],
  });
  groqServiceMock.resolveScheduleCommand.mockResolvedValue({ status: false, message: null });
}

describe('ConversationService - integração de consulta de eventos', () => {
  let service;
  let client;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ConversationService();
    client = { sendMessage: vi.fn() };
    service.setClient(client);
  });

  it('responde com a lista de eventos quando há intenção de consulta', async () => {
    setupHappyPath();
    eventServiceMock.hasEventQueryIntent.mockReturnValue(true);
    eventServiceMock.resolveEventQuery.mockResolvedValue({
      status: true,
      message: 'Próximos eventos da faculdade:\n- Semana Acadêmica (15/06/2026 14:30)',
    });

    await service.telegramReceiveMessage2(buildBody('quais os próximos eventos?'));

    // Consulta de eventos foi feita com o id do usuário.
    expect(eventServiceMock.resolveEventQuery).toHaveBeenCalledWith('admin-1');

    // A resposta de eventos foi persistida como mensagem do assistente.
    const assistantMessageCall = prismaMock.chatMessage.create.mock.calls.find(
      ([arg]) => arg.data.sender === 'assistant',
    );
    expect(assistantMessageCall).toBeTruthy();
    expect(assistantMessageCall[0].data.text).toContain('Próximos eventos da faculdade');

    // A mensagem foi enviada ao Telegram.
    expect(client.sendMessage).toHaveBeenCalledWith(TELEGRAM_CHAT_ID, {
      message: expect.stringContaining('Próximos eventos da faculdade'),
    });

    // Curto-circuito: não chamou a IA generativa para gerar resposta livre.
    expect(eventServiceMock.resolveEventQuery).toHaveBeenCalledOnce();
  });

  it('não consulta eventos quando não há intenção, seguindo para o fluxo da IA', async () => {
    setupHappyPath();
    eventServiceMock.hasEventQueryIntent.mockReturnValue(false);
    prismaMock.chatMessage.findMany.mockResolvedValue([
      { sender: 'contact', text: 'oi', createdAt: new Date() },
    ]);
    academicContextMock.getAcademicContextForPrompt.mockResolvedValue({ contextBlock: '' });
    // Segunda chamada do groq (resposta livre da IA).
    groqServiceMock.groq.chat.completions.create
      .mockResolvedValueOnce({ choices: [{ message: { content: '{}' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Resposta da IA' } }] });

    await service.telegramReceiveMessage2(buildBody('me explique recursão'));

    expect(eventServiceMock.resolveEventQuery).not.toHaveBeenCalled();
    expect(client.sendMessage).toHaveBeenCalledWith(TELEGRAM_CHAT_ID, {
      message: expect.stringContaining('Resposta da IA'),
    });
  });

  it('não consulta eventos quando a conversa está em handover', async () => {
    setupHappyPath({ status: 'handover_pending' });
    eventServiceMock.hasEventQueryIntent.mockReturnValue(true);

    await service.telegramReceiveMessage2(buildBody('quais os próximos eventos?'));

    expect(eventServiceMock.resolveEventQuery).not.toHaveBeenCalled();
    expect(client.sendMessage).toHaveBeenCalledWith(TELEGRAM_CHAT_ID, {
      message: expect.stringContaining('revisão manual'),
    });
  });
});
