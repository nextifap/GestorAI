import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    systemLog: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/prisma', () => ({
  default: prismaMock,
}));

import { __resetLogCleanupForTests, saveSystemLog } from './systemLog';

describe('system log optimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetLogCleanupForTests();
    process.env.LOG_RETENTION_DAYS = '15';
  });

  it('does not persist informational logs', async () => {
    await saveSystemLog({
      level: 'INFO',
      source: 'api/test',
      message: 'debug message',
      context: { a: 1 },
    });

    expect(prismaMock.systemLog.create).not.toHaveBeenCalled();
    expect(prismaMock.systemLog.deleteMany).not.toHaveBeenCalled();
  });

  it('persists warning logs and normalizes Error objects in context', async () => {
    const error = new Error('boom');

    await saveSystemLog({
      level: 'WARN',
      source: 'api/test',
      message: 'warn message',
      context: { error },
    });

    expect(prismaMock.systemLog.create).toHaveBeenCalledOnce();

    const payload = prismaMock.systemLog.create.mock.calls[0][0];
    expect(payload.data.level).toBe('WARN');
    expect(payload.data.source).toBe('api/test');
    expect(payload.data.context.error).toMatchObject({
      name: 'Error',
      message: 'boom',
    });
    expect(prismaMock.systemLog.deleteMany).toHaveBeenCalledOnce();
  });

  it('throttles log cleanup to avoid redundant deleteMany calls', async () => {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/test',
      message: 'first failure',
    });

    await saveSystemLog({
      level: 'ERROR',
      source: 'api/test',
      message: 'second failure',
    });

    expect(prismaMock.systemLog.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.systemLog.deleteMany).toHaveBeenCalledTimes(1);
  });
});
