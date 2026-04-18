// app/api/import-tasks/route.js

import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import prisma from '../../../../lib/prisma';
import { parse } from 'csv-parse';
import { saveSystemLog } from '@/lib/systemLog';

// Middleware para verificar a autenticação
function verificarToken(request) {
  const token = request.headers.get('authorization')?.split(' ')[1];
  if (!token) return { error: 'Token não fornecido.', status: 401 };
  try {
    const usuario = jwt.verify(token, process.env.JWT_SECRET);
    return { usuario, status: 200 };
  } catch (error) {
    return { error: 'Token inválido.', status: 401 };
  }
}

// Rota de Importar (envia do computador para o banco)
export async function POST(request) {
  const verificacao = verificarToken(request);
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

    const newTasks = tasks.map(task => ({
      title: task.title,
      isCompleted: task.isCompleted === 'true' || task.isCompleted === '1',
      userId,
    }));

    await prisma.task.createMany({
      data: newTasks,
    });

    return NextResponse.json({ message: 'Planilha importada com sucesso!' }, { status: 200 });

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