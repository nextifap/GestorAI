// app/api/import-tasks/route.js

import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { parse } from 'csv-parse';
import { z } from 'zod';
import { saveSystemLog } from '@/lib/systemLog';
import { verifyRequestToken } from '@/lib/auth';

const MAX_CSV_ROWS = 1000;
const MAX_TITLE_LENGTH = 255;

const taskImportSchema = z.object({
  title: z.string().trim().min(1, 'Título ausente.').max(MAX_TITLE_LENGTH, `Título excede ${MAX_TITLE_LENGTH} caracteres.`),
  isCompleted: z.boolean(),
});

function normalizeBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'sim', 'yes', 'y'].includes(normalized);
}

function getTaskTitle(rawTask) {
  return String(rawTask.title || rawTask['Título da Tarefa'] || '').trim();
}

function getTaskCompletion(rawTask) {
  const rawCompletion = rawTask.isCompleted ?? rawTask['Concluída'];
  return normalizeBoolean(rawCompletion);
}

function hasCompatibleHeaders(firstRow) {
  if (!firstRow) {
    return true;
  }

  const headers = Object.keys(firstRow).map((header) => String(header).trim());
  return headers.includes('title') || headers.includes('Título da Tarefa');
}

// Rota de Importar (envia do computador para o banco)
export async function POST(request) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return NextResponse.json({ error: verificacao.error }, { status: verificacao.status });
  }

  const { id: userId } = verificacao.usuario;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    }

    const fileContent = await file.text();
    const tasks = await new Promise((resolve, reject) => {
      parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
      }, (err, records) => {
        if (err) reject(err);
        resolve(records);
      });
    });

    if (tasks.length > MAX_CSV_ROWS) {
      return NextResponse.json(
        { error: `O arquivo excede o limite de ${MAX_CSV_ROWS} linhas.` },
        { status: 400 },
      );
    }

    if (!hasCompatibleHeaders(tasks[0])) {
      return NextResponse.json(
        {
          error: 'Cabeçalhos inválidos. Use "title" ou "Título da Tarefa" para o título da tarefa.',
        },
        { status: 400 },
      );
    }

    const invalidRows = [];
    const newTasks = [];

    tasks.forEach((task, index) => {
      const rowNumber = index + 2;
      const parsedTask = taskImportSchema.safeParse({
        title: getTaskTitle(task),
        isCompleted: getTaskCompletion(task),
      });

      if (!parsedTask.success) {
        const firstIssue = parsedTask.error.issues[0];
        invalidRows.push({ row: rowNumber, reason: firstIssue?.message || 'Linha inválida.' });
        return;
      }

      newTasks.push({
        title: parsedTask.data.title,
        isCompleted: parsedTask.data.isCompleted,
        userId,
      });
    });

    if (!newTasks.length) {
      return NextResponse.json(
        {
          error: 'Nenhuma linha válida encontrada para importação.',
          invalidRows,
        },
        { status: 400 },
      );
    }

    await prisma.task.createMany({
      data: newTasks,
    });

    return NextResponse.json(
      {
        message: 'Planilha importada com sucesso!',
        importedCount: newTasks.length,
        invalidCount: invalidRows.length,
        invalidRows,
      },
      { status: 200 },
    );

  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/import-tasks',
      message: 'Erro ao importar planilha.',
      context: { error, userId },
    });
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}