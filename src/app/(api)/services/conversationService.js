import prisma from '../../../lib/prisma';

class ConversationService {
    constructor() {
        this.conversation = [];
    }

    addMessage(message) {
        this.conversation.push(message);
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

const conversationService = new ConversationService();

export default conversationService;