import { describe, expect, it, vi } from 'vitest';
import {
  buildAcademicContextBlock,
  generateQueryEmbedding,
  getAcademicContextForPrompt,
  inferCourseHint,
  searchCurriculumContext,
} from './academicContext';

describe('academic context helpers', () => {
  it('infers course hint for ADS and SI', () => {
    expect(inferCourseHint('grade de ADS da unifapce')).toBe('ADS');
    expect(inferCourseHint('disciplinas de Sistemas de Informacao')).toBe('SI');
    expect(inferCourseHint('duvida geral')).toBeNull();
  });

  it('builds formatted academic context block', () => {
    const block = buildAcademicContextBlock([
      {
        course: 'ADS',
        semester: '3',
        discipline: 'Estrutura de Dados',
        source: 'matriz-2026.pdf',
        similarity: 0.83,
        content: 'A disciplina aborda listas, pilhas, filas, arvores e grafos.',
      },
    ]);

    expect(block).toContain('Curso: ADS');
    expect(block).toContain('Disciplina: Estrutura de Dados');
    expect(block).toContain('Similaridade: 83%');
  });

  it('returns empty block when there are no matches', () => {
    expect(buildAcademicContextBlock([])).toBe('');
  });
});

describe('academic context integration', () => {
  it('requests embedding from Groq client', async () => {
    const groqClient = {
      embeddings: {
        create: vi.fn().mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
      },
    };

    const embedding = await generateQueryEmbedding({
      groqClient,
      text: 'Quais disciplinas de ADS no terceiro semestre?',
    });

    expect(embedding).toEqual([0.1, 0.2, 0.3]);
    expect(groqClient.embeddings.create).toHaveBeenCalledOnce();
  });

  it('queries curriculum RPC via Prisma', async () => {
    const prismaClient = {
      $queryRaw: vi.fn().mockResolvedValue([
        { id: '1', content: 'Conteudo', course: 'ADS', similarity: 0.9 },
      ]),
    };

    const rows = await searchCurriculumContext({
      prismaClient,
      queryEmbedding: [0.1, 0.2, 0.3],
      courseHint: 'ADS',
      matchCount: 3,
      minSimilarity: 0.5,
    });

    expect(rows).toHaveLength(1);
    expect(prismaClient.$queryRaw).toHaveBeenCalledOnce();
  });

  it('builds prompt context end-to-end', async () => {
    const prismaClient = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: 'abc',
          course: 'SI',
          semester: '2',
          discipline: 'Algoritmos',
          content: 'Introducao a logica e algoritmos.',
          source: 'si-matriz.pdf',
          metadata: {},
          similarity: 0.79,
        },
      ]),
    };

    const groqClient = {
      embeddings: {
        create: vi.fn().mockResolvedValue({ data: [{ embedding: [0.01, 0.02, 0.03] }] }),
      },
    };

    const result = await getAcademicContextForPrompt({
      prismaClient,
      groqClient,
      userMessage: 'quais materias de si no segundo semestre?',
    });

    expect(result.courseHint).toBe('SI');
    expect(result.matches).toHaveLength(1);
    expect(result.contextBlock).toContain('Algoritmos');
  });
});
