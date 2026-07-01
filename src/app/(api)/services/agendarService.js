import { errorResponse, respondAuthError } from '@/lib/apiErrors';
import {
    getDateBlockReason,
  parseIsoDateOnly,
} from './../../../lib/schedule.js';

const agendar = async (contactId, body) => {

    try {
        const { managerId, date, hour, channel = 'web', justification = null, conversationId = null } = body;

        if (!managerId || !date || typeof hour === 'undefined') {
            return errorResponse('APPOINTMENT_REQUEST_INVALID');
        }

        const parsedDate = parseIsoDateOnly(date);
        const parsedHour = Number(hour);

        if (!parsedDate || Number.isNaN(parsedHour) || parsedHour < 0 || parsedHour > 23) {
            return errorResponse('APPOINTMENT_DATE_OR_HOUR_INVALID');
        }

        // Verificar se já existe uma solicitação idêntica
        const existing = await prisma.appointmentRequest.findFirst({
            where: {
            managerId,
            requesterId: contactId,
            requestedDate: parsedDate,
            requestedHour: parsedHour,
            },
        });

        if (existing) {
            return {ok: false, message: `Você já tem uma solicitação registrada para ${date} às ${hour}h. Aguarde a resposta do gestor.`};
        }

        // Verificar regras de bloqueio de data (retroativo, fim de semana, feriado)
        const dateBlock = getDateBlockReason(parsedDate);
        if (dateBlock) {
            return {ok: false, message: dateBlock };
        }

        // Verificar se já existe um slot ocupado (isAvailable = false) para esse horário
        const existingSlot = await prisma.managerScheduleSlot.findFirst({
            where: {
            managerId,
            date: parsedDate,
            hour: parsedHour,
            isAvailable: false,
            },
            select: { id: true },
        });

        if (existingSlot) {
            return errorResponse('APPOINTMENT_SLOT_UNAVAILABLE');
        }

        const created = await prisma.appointmentRequest.create({
            data: {
            managerId,
            requesterId: contactId,
            requestedDate: parsedDate,
            requestedHour: parsedHour,
            channel,
            justification,
            status: 'pending',
            ...(conversationId ? { conversationId } : {}),
            },
        });

       return {ok: true, message: `Solicitação registrada para ${date} às ${hour}h. O gestor precisa aprovar ou recusar esse pedido.`};
    } catch (error) {
        console.error("Error creating appointment request:", error);
    }
};

export default agendar;