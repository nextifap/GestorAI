import prisma from '@/lib/prisma';

let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 15;
const REDACTED_KEYS = new Set([
  'authorization',
  'cookie',
  'token',
  'password',
  'senha',
  'stack',
  'body',
  'errortext',
  'telegramerror',
  'rawpayload',
]);

export function __resetLogCleanupForTests() {
  lastCleanupAt = 0;
}

function normalizeContext(context) {
  if (!context) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(context, (key, value) => {
      if (REDACTED_KEYS.has(String(key).toLowerCase())) {
        return '[REDACTED]';
      }

      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
        };
      }

      if (typeof value === 'string' && value.length > 500) {
        return `${value.slice(0, 500)}...[TRUNCATED]`;
      }

      return value;
    }));
  } catch {
    return { note: 'Contexto não serializável' };
  }
}

async function cleanupOldLogs() {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) {
    return;
  }

  lastCleanupAt = now;

  const retentionDays = Number.parseInt(process.env.LOG_RETENTION_DAYS || '', 10) || DEFAULT_RETENTION_DAYS;
  const cutoffDate = new Date(now - retentionDays * 24 * 60 * 60 * 1000);

  await prisma.systemLog.deleteMany({
    where: {
      createdAt: { lt: cutoffDate },
    },
  });
}

export async function saveSystemLog({ level = 'INFO', source = 'api', message, context }) {
  if (!message || (level !== 'ERROR' && level !== 'WARN')) {
    return;
  }

  try {
    await prisma.systemLog.create({
      data: {
        level,
        source,
        message,
        context: normalizeContext(context),
      },
    });

    await cleanupOldLogs();
  } catch {
    // Evita quebrar o fluxo principal por falha de log.
  }
}
