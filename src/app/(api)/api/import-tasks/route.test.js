import { beforeEach, describe, expect, it, vi } from 'vitest';

const jsonMock = vi.fn((body, init) => ({
  type: 'json',
  body,
  status: init?.status ?? 200,
}));

const createManyMock = vi.fn();
const verifyRequestTokenMock = vi.fn();
const saveSystemLogMock = vi.fn();

vi.mock('next/server', () => ({
  NextResponse: {
    json: (...args) => jsonMock(...args),
  },
}));

vi.mock('../../../../lib/prisma', () => ({
  default: {
    task: {
      createMany: (...args) => createManyMock(...args),
    },
  },
}));

vi.mock('@/lib/auth', () => ({
  verifyRequestToken: (...args) => verifyRequestTokenMock(...args),
}));

vi.mock('@/lib/systemLog', () => ({
  saveSystemLog: (...args) => saveSystemLogMock(...args),
}));

import { POST } from './route';

function buildRequestFromCsv(csvText) {
  return {
    formData: async () => ({
      get: (name) => {
        if (name !== 'file') {
          return null;
        }

        return {
          text: async () => csvText,
        };
      },
    }),
  };
}

describe('import-tasks route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyRequestTokenMock.mockReturnValue({ status: 200, usuario: { id: 'user-1' } });
    createManyMock.mockResolvedValue({ count: 2 });
  });

  it('returns 401 when token is invalid', async () => {
    verifyRequestTokenMock.mockReturnValue({ status: 401, error: 'Token inválido.' });

    const response = await POST({});

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Token inválido.' });
    expect(createManyMock).not.toHaveBeenCalled();
  });

  it('imports valid rows and reports invalid ones with normalized booleans', async () => {
    const csv = [
      'Título da Tarefa,Concluída',
      'Revisar relatório,sim',
      ',nao',
      'Enviar ata,true',
    ].join('\n');

    const response = await POST(buildRequestFromCsv(csv));

    expect(response.status).toBe(200);
    expect(response.body.importedCount).toBe(2);
    expect(response.body.invalidCount).toBe(1);
    expect(response.body.invalidRows).toHaveLength(1);

    expect(createManyMock).toHaveBeenCalledOnce();
    expect(createManyMock).toHaveBeenCalledWith({
      data: [
        {
          title: 'Revisar relatório',
          isCompleted: true,
          userId: 'user-1',
        },
        {
          title: 'Enviar ata',
          isCompleted: true,
          userId: 'user-1',
        },
      ],
    });

    expect(saveSystemLogMock).not.toHaveBeenCalled();
  });
});