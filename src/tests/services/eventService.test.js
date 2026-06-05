import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    campusEvent: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

const { resolveManagerUserIdMock } = vi.hoisted(() => ({
  resolveManagerUserIdMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: prismaMock,
}));

vi.mock('@/lib/manager', () => ({
  resolveManagerUserId: resolveManagerUserIdMock,
}));

import eventService from '@/app/(api)/services/eventService.js';

const { hasEventQueryIntent, resolveEventQuery } = eventService;

describe('hasEventQueryIntent', () => {
  it.each([
    'quais os próximos eventos da faculdade?',
    'tem alguma palestra essa semana?',
    'vai ter feira de profissões?',
    'quando é a semana acadêmica?',
    'tem algum WORKSHOP marcado?',
    'me fala do calendário acadêmico',
    'quero saber dos eventos',
  ])('retorna true para mensagem de consulta de eventos: "%s"', (message) => {
    expect(hasEventQueryIntent(message)).toBe(true);
  });

  it.each([
    'quero agendar uma reunião amanhã',
    'quais horários livres você tem?',
    'me ajude com a matéria de cálculo',
    'oi, tudo bem?',
    '',
    null,
    undefined,
  ])('retorna false para mensagem sem intenção de eventos: "%s"', (message) => {
    expect(hasEventQueryIntent(message)).toBe(false);
  });
});

describe('resolveEventQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveManagerUserIdMock.mockResolvedValue('manager-1');
  });

  it('busca os eventos do gestor dono (resolveManagerUserId)', async () => {
    prismaMock.campusEvent.findMany.mockResolvedValue([]);

    await resolveEventQuery('aluno-telegram');

    expect(resolveManagerUserIdMock).toHaveBeenCalledWith('aluno-telegram');
    const args = prismaMock.campusEvent.findMany.mock.calls[0][0];
    expect(args.where.userId).toBe('manager-1');
  });

  it('consulta apenas eventos futuros, ordenados por data e com limite', async () => {
    prismaMock.campusEvent.findMany.mockResolvedValue([]);

    const before = Date.now();
    await resolveEventQuery('aluno', { limit: 5 });
    const after = Date.now();

    const args = prismaMock.campusEvent.findMany.mock.calls[0][0];
    expect(args.where.eventDate.gte).toBeInstanceOf(Date);
    const gteTime = args.where.eventDate.gte.getTime();
    expect(gteTime).toBeGreaterThanOrEqual(before);
    expect(gteTime).toBeLessThanOrEqual(after);
    expect(args.orderBy).toEqual({ eventDate: 'asc' });
    expect(args.take).toBe(5);
  });

  it('usa o limite padrão de 10 quando não informado', async () => {
    prismaMock.campusEvent.findMany.mockResolvedValue([]);

    await resolveEventQuery('aluno');

    expect(prismaMock.campusEvent.findMany.mock.calls[0][0].take).toBe(10);
  });

  it('retorna status false e mensagem amigável quando não há eventos', async () => {
    prismaMock.campusEvent.findMany.mockResolvedValue([]);

    const result = await resolveEventQuery('aluno');

    expect(result).toEqual({
      status: false,
      message: 'No momento não há eventos da faculdade cadastrados.',
    });
  });

  it('formata a lista de eventos com título, data/hora (America/Sao_Paulo) e descrição', async () => {
    prismaMock.campusEvent.findMany.mockResolvedValue([
      {
        id: '1',
        title: 'Semana Acadêmica',
        description: 'Palestras e oficinas',
        eventDate: new Date('2026-06-15T17:30:00Z'), // 14:30 em America/Sao_Paulo
      },
    ]);

    const result = await resolveEventQuery('aluno');

    expect(result.status).toBe(true);
    expect(result.message).toContain('Próximos eventos da faculdade:');
    expect(result.message).toContain('Semana Acadêmica');
    expect(result.message).toContain('15/06/2026');
    expect(result.message).toContain('14:30');
    expect(result.message).toContain('— Palestras e oficinas');
  });

  it('omite o traço de descrição quando o evento não tem descrição', async () => {
    prismaMock.campusEvent.findMany.mockResolvedValue([
      {
        id: '2',
        title: 'Aula Inaugural',
        description: null,
        eventDate: new Date('2026-08-01T13:00:00Z'),
      },
    ]);

    const result = await resolveEventQuery('aluno');

    expect(result.message).toContain('Aula Inaugural');
    expect(result.message).not.toContain('—');
  });

  it('lista múltiplos eventos, um por linha', async () => {
    prismaMock.campusEvent.findMany.mockResolvedValue([
      { id: '1', title: 'Evento A', description: null, eventDate: new Date('2026-06-15T17:30:00Z') },
      { id: '2', title: 'Evento B', description: null, eventDate: new Date('2026-06-20T17:30:00Z') },
    ]);

    const result = await resolveEventQuery('aluno');

    const lines = result.message.split('\n');
    expect(lines).toHaveLength(3); // cabeçalho + 2 eventos
    expect(lines[1]).toContain('Evento A');
    expect(lines[2]).toContain('Evento B');
  });

  it('NÃO realiza nenhuma operação de escrita (apenas leitura)', async () => {
    prismaMock.campusEvent.findMany.mockResolvedValue([]);

    await resolveEventQuery('aluno');

    expect(prismaMock.campusEvent.findMany).toHaveBeenCalledOnce();
    expect(prismaMock.campusEvent.create).not.toHaveBeenCalled();
    expect(prismaMock.campusEvent.update).not.toHaveBeenCalled();
    expect(prismaMock.campusEvent.delete).not.toHaveBeenCalled();
    expect(prismaMock.campusEvent.deleteMany).not.toHaveBeenCalled();
  });
});
