// app/api/export-tasks/route.js

import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { stringify } from 'csv-stringify';
import { saveSystemLog } from '@/lib/systemLog';
import { verifyRequestToken } from '@/lib/auth';

// Rota de Exportar (puxa do banco para o computador)
export async function GET(request) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return NextResponse.json({ error: verificacao.error }, { status: verificacao.status });
  }

  const { id: userId } = verificacao.usuario;

  try {
    const tasks = await prisma.task.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        isCompleted: true,
        createdAt: true,
      },
    });

    const columns = {
      id: 'ID',
      title: 'Título da Tarefa',
      isCompleted: 'Concluída',
      createdAt: 'Data de Criação',
    };

    const csvData = await new Promise((resolve, reject) => {
      stringify(tasks, { header: true, columns }, (err, output) => {
        if (err) reject(err);
        resolve(output);
      });
    });

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="tarefas_exportadas.csv"',
      },
    });

  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/export-tasks',
      message: 'Erro ao exportar tarefas.',
      context: { error, userId },
    });
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}