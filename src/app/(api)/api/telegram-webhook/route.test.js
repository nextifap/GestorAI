import { beforeEach, describe, expect, it, vi } from 'vitest';

const jsonMock = vi.fn((body, init) => ({
  type: 'json',
  body,
  status: init?.status ?? 200,
}));

const jwtSignMock = vi.fn(() => 'internal-token');
const bcryptHashMock = vi.fn(async () => 'hash-senha');
const saveSystemLogMock = vi.fn();

const userFindUniqueMock = vi.fn();
const userCreateMock = vi.fn();
const conversationFindFirstMock = vi.fn();
const conversationCreateMock = vi.fn();
const conversationUpdateMock = vi.fn();

vi.mock('next/server', () => ({
  NextResponse: {
    json: (...args) => jsonMock(...args),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: (...args) => jwtSignMock(...args),
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: (...args) => bcryptHashMock(...args),
  },
}));

vi.mock('groq-sdk', () => ({
  default: class GroqMock {
    constructor() {
      this.chat = {
        completions: {
          create: vi.fn(),
        },
      };
    }
  },
}));

vi.mock('../../../../lib/prisma', () => ({
  default: {
    user: {
      findUnique: (...args) => userFindUniqueMock(...args),
      create: (...args) => userCreateMock(...args),
    },
    conversation: {
      findFirst: (...args) => conversationFindFirstMock(...args),
      create: (...args) => conversationCreateMock(...args),
      update: (...args) => conversationUpdateMock(...args),
    },
  },
}));

vi.mock('@/lib/systemLog', () => ({
  saveSystemLog: (...args) => saveSystemLogMock(...args),
}));

function buildTelegramRequest({
  secretHeader = null,
  text = 'urgente, preciso falar com humano',
  chatId = 321,
  telegramUserId = 123,
} = {}) {
  return {
    url: 'http://localhost:3000/api/telegram-webhook',
    headers: {
      get: (name) => (name === 'x-telegram-bot-api-secret-token' ? secretHeader : null),
    },
    json: async () => ({
      message: {
        text,
        chat: { id: chatId },
        from: { id: telegramUserId },
      },
    }),
  };
}

describe('telegram-webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env.JWT_SECRET = 'test-secret';
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
    process.env.GROQ_API_KEY = '';

    global.fetch = vi.fn();
  });

  it('returns 401 when webhook secret header is invalid', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'secret-correto';

    const { POST } = await import('./route');
    const response = await POST(buildTelegramRequest({ secretHeader: 'secret-incorreto' }));

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Não autorizado.' });
    expect(saveSystemLogMock).toHaveBeenCalledOnce();
    expect(saveSystemLogMock.mock.calls[0][0]).toMatchObject({
      level: 'WARN',
      source: 'api/telegram-webhook',
    });
  });

  it('reuses persisted telegramId and escalates to handover when keyword is detected', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;

    userFindUniqueMock.mockResolvedValue({
      id: 'user-telegram-1',
      email: '123@telegram.local',
      nomeCompleto: 'Usuário Telegram 123',
    });
    conversationFindFirstMock.mockResolvedValue({ id: 'conv-1', channel: 'telegram' });
    conversationUpdateMock.mockResolvedValue({ id: 'conv-1', status: 'handover_pending' });

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'Resposta do assistente.' }),
      })
      .mockResolvedValueOnce({ ok: true });

    const { POST } = await import('./route');
    const response = await POST(
      buildTelegramRequest({
        text: 'isso é urgente, quero atendimento humano',
        telegramUserId: 123,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.body.triage.needsHandover).toBe(true);

    expect(userFindUniqueMock).toHaveBeenCalledWith({ where: { telegramId: '123' } });
    expect(userCreateMock).not.toHaveBeenCalled();

    expect(conversationUpdateMock).toHaveBeenCalledOnce();
    expect(conversationUpdateMock.mock.calls[0][0]).toMatchObject({
      where: { id: 'conv-1' },
      data: expect.objectContaining({
        status: 'handover_pending',
        handlingMode: 'Manual',
      }),
    });

    expect(jwtSignMock).toHaveBeenCalledOnce();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});