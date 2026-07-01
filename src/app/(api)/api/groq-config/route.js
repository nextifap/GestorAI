import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { verifyRequestToken } from '@/lib/auth';
import { errorResponse, respondAuthError } from '@/lib/apiErrors';
import { saveSystemLog } from '@/lib/systemLog';

const groqConfigSchema = z.object({
  hash: z.string().min(1).max(500),
});

async function requireAdmin(request) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return { response: respondAuthError(verificacao) };
  }

  const user = await prisma.user.findUnique({ where: { id: verificacao.usuario.id } });
  if (!user) {
    return { response: errorResponse('AUTH_USER_NOT_FOUND') };
  }

  if (user.role !== 'admin') {
    return { response: errorResponse('AUTH_FORBIDDEN') };
  }

  return { user };
}

export async function GET(request) {
  const { response } = await requireAdmin(request);
  if (response) {
    return response;
  }

  try {
    // Get or create GroqConfig
    let config = await prisma.groqConfig.findFirst();
    
    if (!config) {
      config = await prisma.groqConfig.create({
        data: {
          hash: false,
        },
      });
    }

    return NextResponse.json({ 
      config: {
        id: config.id,
        hash: config.hash,
        isConfigured: Boolean(config.hash),
      }
    }, { status: 200 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/groq-config',
      message: 'Erro ao recuperar configuração do Groq.',
      context: { error },
    });

    return errorResponse('GROQ_CONFIG_FETCH_FAILED');
  }
}

export async function POST(request) {
  const { response } = await requireAdmin(request);
  if (response) {
    return response;
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('JSON_INVALID');
  }

  const parsed = groqConfigSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return errorResponse('GROQ_CONFIG_INVALID', { status: 400, message: issue?.message || 'Dados inválidos.' });
  }

  try {
    // Get or create GroqConfig
    let config = await prisma.groqConfig.findFirst();
    
    if (!config) {
      config = await prisma.groqConfig.create({
        data: {
          hash: parsed.data.hash,
        },
      });
    } else {
      config = await prisma.groqConfig.update({
        where: { id: config.id },
        data: {
          hash: parsed.data.hash,
        },
      });
    }

    await saveSystemLog({
      level: 'INFO',
      source: 'api/groq-config',
      message: 'Configuração do Groq atualizada.',
      context: { configId: config.id },
    });

    return NextResponse.json({ 
      config: {
        id: config.id,
        hash: config.hash,
        isConfigured: Boolean(config.hash),
      }
    }, { status: 200 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/groq-config',
      message: 'Erro ao salvar configuração do Groq.',
      context: { error },
    });

    return errorResponse('GROQ_CONFIG_SAVE_FAILED');
  }
}

export async function DELETE(request) {
  const { response } = await requireAdmin(request);
  if (response) {
    return response;
  }

  try {
    const config = await prisma.groqConfig.findFirst();
    
    if (config) {
      await prisma.groqConfig.update({
        where: { id: config.id },
        data: {
          hash: null,
        },
      });
    }

    await saveSystemLog({
      level: 'INFO',
      source: 'api/groq-config',
      message: 'Configuração do Groq removida.',
    });

    return NextResponse.json({ 
      message: 'Configuração removida com sucesso.',
    }, { status: 200 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/groq-config',
      message: 'Erro ao remover configuração do Groq.',
      context: { error },
    });

    return errorResponse('GROQ_CONFIG_DELETE_FAILED');
  }
}
