import prisma from './../../../lib/prisma.js';
import { resolveManagerUserId } from './../../../lib/manager.js';

// Limite padrão de eventos retornados em uma consulta pelo chat.
const DEFAULT_EVENT_LIMIT = 10;

// Termos que indicam que o aluno quer CONSULTAR (apenas leitura) os eventos da faculdade.
const EVENT_QUERY_TERMS = [
  'evento',
  'eventos',
  'palestra',
  'palestras',
  'workshop',
  'minicurso',
  'semana academica',
  'semana acadêmica',
  'feira',
  'congresso',
  'seminario',
  'seminário',
  'programacao da faculdade',
  'programação da faculdade',
  'calendario academico',
  'calendário acadêmico',
  'proximos eventos',
  'próximos eventos',
];

function normalize(message) {
  return String(message || '').toLowerCase();
}

function hasEventQueryIntent(message) {
  const normalized = normalize(message);
  return EVENT_QUERY_TERMS.some((term) => normalized.includes(term));
}

function formatEventLine(event) {
  const when = new Date(event.eventDate).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });

  const description = event.description ? ` — ${event.description}` : '';
  return `- ${event.title} (${when})${description}`;
}

/**
 * Consulta os próximos eventos da faculdade para o aluno.
 *
 * IMPORTANTE: esta operação é EXCLUSIVAMENTE de leitura. O aluno não possui
 * permissão de escrita sobre eventos — aqui só fazemos `findMany`.
 */
async function resolveEventQuery(userId, { limit = DEFAULT_EVENT_LIMIT } = {}) {
  // Os eventos pertencem ao gestor que os cadastrou pelo painel web.
  const ownerId = await resolveManagerUserId(userId);

  const now = new Date();

  const events = await prisma.campusEvent.findMany({
    where: {
      userId: ownerId,
      eventDate: { gte: now },
    },
    orderBy: { eventDate: 'asc' },
    take: limit,
  });

  if (!events.length) {
    return {
      status: false,
      message: 'No momento não há eventos da faculdade cadastrados.',
    };
  }

  const lines = events.map(formatEventLine);

  return {
    status: true,
    message: `Próximos eventos da faculdade:\n${lines.join('\n')}`,
  };
}

export default {
  hasEventQueryIntent,
  resolveEventQuery,
};
