import { Prisma } from '@prisma/client';

const EMBEDDING_MODEL = 'nomic-embed-text-v1.5';
const DEFAULT_MATCH_COUNT = 5;
const DEFAULT_MIN_SIMILARITY = 0.55;
const MAX_CONTEXT_CHARS = 650;

function clampText(value, maxChars = MAX_CONTEXT_CHARS) {
  const text = String(value || '').trim();
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars)}...`;
}

function toPgVectorLiteral(embedding) {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('Embedding inválido para busca vetorial.');
  }

  const values = embedding.map((value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error('Embedding contém valores não numéricos.');
    }

    return parsed;
  });

  return `[${values.join(',')}]`;
}

export function inferCourseHint(message) {
  const normalized = String(message || '').toLowerCase();

  if (normalized.includes('ads') || normalized.includes('análise e desenvolvimento de sistemas') || normalized.includes('analise e desenvolvimento de sistemas')) {
    return 'ADS';
  }

  if (/\bsi\b/.test(normalized) || normalized.includes('sistemas de informação') || normalized.includes('sistemas de informacao')) {
    return 'SI';
  }

  return null;
}

export async function generateQueryEmbedding({ groqClient, text, model = EMBEDDING_MODEL }) {
  const trimmedText = String(text || '').trim();

  if (!trimmedText) {
    return null;
  }

  const response = await groqClient.embeddings.create({
    model,
    input: trimmedText,
  });

  const embedding = response?.data?.[0]?.embedding;

  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('Groq não retornou embedding válido.');
  }

  return embedding;
}

export async function searchCurriculumContext({
  prismaClient,
  queryEmbedding,
  courseHint = null,
  matchCount = DEFAULT_MATCH_COUNT,
  minSimilarity = DEFAULT_MIN_SIMILARITY,
}) {
  const vectorLiteral = toPgVectorLiteral(queryEmbedding);

  const rows = await prismaClient.$queryRaw(
    Prisma.sql`
      SELECT
        id,
        course,
        semester,
        discipline,
        content,
        source,
        metadata,
        similarity
      FROM match_curriculum_context(
        ${vectorLiteral}::vector,
        ${Math.max(Number(matchCount) || 1, 1)},
        ${Number(minSimilarity) || DEFAULT_MIN_SIMILARITY},
        ${courseHint}
      )
    `,
  );

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows;
}

export function buildAcademicContextBlock(matches) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return '';
  }

  const lines = matches.map((match, index) => {
    const course = match?.course || 'N/D';
    const semester = match?.semester || 'N/D';
    const discipline = match?.discipline || 'N/D';
    const source = match?.source || 'N/D';
    const similarity = Number(match?.similarity);
    const similarityPct = Number.isFinite(similarity) ? `${Math.round(similarity * 100)}%` : 'N/D';
    const content = clampText(match?.content);

    return `${index + 1}. Curso: ${course} | Semestre: ${semester} | Disciplina: ${discipline} | Similaridade: ${similarityPct}\nFonte: ${source}\nTrecho: ${content}`;
  });

  return lines.join('\n\n');
}

export async function getAcademicContextForPrompt({ prismaClient, groqClient, userMessage }) {
  const queryEmbedding = await generateQueryEmbedding({
    groqClient,
    text: userMessage,
  });

  if (!queryEmbedding) {
    return { matches: [], contextBlock: '', courseHint: null };
  }

  const courseHint = inferCourseHint(userMessage);
  const matches = await searchCurriculumContext({
    prismaClient,
    queryEmbedding,
    courseHint,
  });

  return {
    matches,
    contextBlock: buildAcademicContextBlock(matches),
    courseHint,
  };
}
