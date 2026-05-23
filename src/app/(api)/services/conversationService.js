import { saveSystemLog } from './../../../lib/systemLog.js';
import prisma from './../../../lib/prisma.js';
import { getAcademicContextForPrompt } from './../../../lib/academicContext.js';
import groqService from './groqService.js';

const { resolveScheduleCommand, groq, hasScheduleCommand } = groqService;
class ConversationService {
    constructor() {
        this.conversation = [];
    }

    setClient(client) {
        this.client = client;
    }

    async telegramReceiveAMessage(message) {

        // No futuro pode pedir pra IA definir o destinatario da mensagem, e criar um contato novo caso necessário. Por enquanto, vamos associar todas as mensagens a um contato genérico.
        const user = await prisma.user.findFirst({
            where: {
                email: process.env.EMAIL_ADMIN
            }
        });

        const contact = await prisma.contact.upsert({
            where: {
                telephone: message.telefone
            },
            update: {
                name: message.nome
            },
            create: {
                name: message.nome,
                telephone: message.telefone,
                userId: user.id
            }
        });

        // 1. Tenta buscar uma conversa existente para esse contato
        let conversation = await prisma.conversation.findFirst({
            where: {
                contactId: contact.id,
            }
        });

        // 2. Se não encontrar, cria uma nova conversa
        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: {
                    summary: message.text.substring(0, 100),
                    telegramChatId: message.chatId,
                    user: {
                        connect: { id: user.id }
                    },
                    contact: {
                        connect: { id: contact.id }
                    }
                }
            });
        }

        // A partir daqui, a variável `conversation` contém o registro (existente ou recém-criado)
        const newConversation = conversation;

        // Salva mensagem do usuário
        const status = await prisma.chatMessage.create({
            data: {
                conversation: {
                    connect: { id: newConversation.id }
                },
                text: message.text,
                sender: 'user',
            },
        });

        if (status) {
            // Atualiza o timestamp da conversa para ordenação
            await prisma.conversation.update({
                where: { id: newConversation.id },
                data: { updatedAt: new Date() }
            });
        }
    }

    async telegramReceiveMessage2(body) {
        try {

            // No futuro pode pedir pra IA definir o destinatario da mensagem, e criar um contato novo caso necessário. Por enquanto, vamos associar todas as mensagens a um contato genérico.
            var user = await prisma.user.findFirst({
                where: {
                    email: process.env.EMAIL_ADMIN
                }
            });

            var contact = await prisma.contact.upsert({
                where: {
                    telephone: body.telefone
                },
                update: {
                    name: body.nome
                },
                create: {
                    name: body.nome,
                    telephone: body.telefone,
                    userId: user.id
                }
            });

            // 1. Tenta buscar uma conversa existente para esse contato
            let conversation = await prisma.conversation.findFirst({
                where: {
                    contactId: contact.id,
                }
            });

            var userId = user.id;

            // 2. Se não encontrar, cria uma nova conversa
            if (!conversation) {
                conversation = await prisma.conversation.create({
                    data: {
                        summary: body.text.substring(0, 100),
                        telegramChatId: body.chatId,
                        user: {
                            connect: { id: user.id }
                        },
                        contact: {
                            connect: { id: contact.id }
                        }
                    }
                });
            }

            // A partir daqui, a variável `conversation` contém o registro (existente ou recém-criado)
            const newConversation = conversation;
            var conversationId = newConversation ? newConversation.id : null;

            // Salva mensagem do usuário
            const message = await prisma.chatMessage.create({
                data: {
                    conversation: {
                        connect: { id: newConversation.id }
                    },
                    text: body.text,
                    sender: 'contact',
                },
            });

            if (conversation.status === 'handover_pending' || conversation.status === 'handover_in_progress') {
                this.sendAssistantMessage('Seu atendimento está em revisão manual pelo coordenador. Retornaremos em breve.', conversation);
            }

            const scheduleResponse = await resolveScheduleCommand({
                message: body.text,
                userId: user.id,
                conversation,
            });

            if (scheduleResponse) {
                await prisma.chatMessage.create({
                    data: {
                    conversationId: conversation.id,
                    text: scheduleResponse,
                    sender: 'assistant',
                    },
                });

                await prisma.conversation.update({
                    where: { id: conversation.id },
                    data: { updatedAt: new Date() },
                });

                // Responde aqui ....
                return NextResponse.json({ response: scheduleResponse }, { status: 200 });
            }

            // Limita o contexto para as últimas 10 mensagens (Performance)
            const messages = await prisma.chatMessage.findMany({
                where: { conversationId },
                orderBy: { createdAt: 'desc' }, 
                take: 10, 
            });

            // Formata mensagens para Groq (inverte a ordem para cronologia correta)
            const chatMessages = messages.reverse().map(msg => ({
                role: msg.sender === 'user' ? 'user' : 'assistant',
                content: msg.text,
            }));
                
            // --- CORREÇÃO: Usar 'timeZone' em vez de 'timeZoneName' ---
            
            // 1. Obtém a data e hora atual formatada em Português/Brasil
            const now = new Date();
            const dataHoraAtual = now.toLocaleString('pt-BR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                // CORREÇÃO APLICADA AQUI:
                timeZone: 'America/Sao_Paulo', // Usa a propriedade correta para o identificador
            });

            let academicContextBlock = '';

            try {
                const contextResult = await getAcademicContextForPrompt({
                    prismaClient: prisma,
                    groqClient: groq,
                    userMessage,
                });

                academicContextBlock = contextResult.contextBlock;
            } catch (contextError) {
                await saveSystemLog({
                    level: 'WARN',
                    source: 'api/chat',
                    message: 'Falha ao recuperar contexto acadêmico vetorial.',
                    context: { contextError, conversationId, userId },
                });
            }

            const academicInstructions = academicContextBlock
            ? `\n\nContexto acadêmico recuperado da base curricular da Unifapce (ADS e SI):\n${academicContextBlock}\n\nUse esse contexto como fonte prioritária quando for pertinente à pergunta. Se houver incerteza, deixe isso explícito e evite inventar informações.`
            : '';

            // 2. Cria o conteúdo do System Prompt, incluindo a data/hora
            const systemPromptContent = `Você é o GestorAI, um assistente virtual acadêmico da Unifapce para ADS e SI. Sua função principal é responder dúvidas acadêmicas, orientar o aluno e também ajudar na organização de tarefas.

            Atenção: A data e hora atual do sistema é: ${dataHoraAtual}. Utilize essa informação como sua referência temporal e responda com base nela.

            Se o usuário pedir para 'criar uma tarefa', você DEVE pedir os detalhes COMPLETO da tarefa, incluindo o título, o DIA e a HORA.

            Exemplo de resposta ao pedido de tarefa: 'Com certeza! Para eu criar a tarefa, qual o título, o dia e a hora que você precisa que seja feito?'

            Responda sempre de forma prestativa, concisa e focada no contexto acadêmico e na produtividade.${academicInstructions}`;


            // Adiciona instrução do sistema
            chatMessages.unshift({
                role: 'system',
                content: systemPromptContent,
            });

            // --- FIM CORREÇÃO ---

            // Chamada Groq
            const chatCompletion = await groq.chat.completions.create({
                model: 'openai/gpt-oss-20b',
                messages: chatMessages,
            });

            const assistantResponse = chatCompletion.choices[0]?.message?.content || 'Não consegui gerar uma resposta.';

            // Salva resposta do assistente
            await prisma.chatMessage.create({
                data: {
                    conversationId: conversation.id,
                    text: assistantResponse,
                    sender: 'assistant',
                },
            });

            return this.sendAssistantMessage(assistantResponse, conversation);

        } catch (error) {
            console.warn('Erro ao processar mensagem do Telegram:', error);
            await saveSystemLog({
                level: 'ERROR',
                source: 'api/chat',
                message: 'Erro interno na rota de chat.',
                context: { error, conversationId, userId },
            });
        }
    }

    async sendAssistantMessage(message, conversation) {
        if (!this.client || !conversation.telegramChatId) {
            console.warn('Cliente Telegram não configurado. Impossível enviar mensagem.');
            return;
        }

        this.client.sendMessage(conversation.telegramChatId, { 
            message: message
        });

        console.info(`Mensagem enviada para Telegram Chat ID ${conversation.telegramChatId}: ${message}`);
    }

    async getConversations(contactName, userId, newMessages = false) {

        var contactQuery = null;
        var newMessagesQuery = null;

        if (contactName) {
            contactQuery = {
                OR: [
                    {
                        name: {
                        contains: contactName,
                        mode: "insensitive"
                        }
                    },
                    {
                        telephone: {
                        contains: contactName,
                        mode: "insensitive"
                        }
                    }
                ]
            }
        }

        const conversations = await prisma.conversation.findMany({
            where: { 
                userId,
                ...(contactQuery && { contact: contactQuery }),
                ...(newMessages && { newMessages: newMessages })
            },
            orderBy: { updatedAt: 'desc' },
            include: {
                contact: true
            },
            take: 50,
        });

        return conversations
    }
}

export default ConversationService;