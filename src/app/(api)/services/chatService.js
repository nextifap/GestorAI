import clients from "@/lib/see-clients";

const receiveAMessage = (message) => {
    for (const client of clients) {
        try {
            client.enqueue(
            `data: ${JSON.stringify(parametro)}\n\n`
            );
        } catch (err) {
            clients.delete(client);
            console.error("Erro ao enviar mensagem para cliente:", err);
        }
    }
}

const sendAMessage = (message) => {
    // Lógica para enviar uma mensagem para o Telegram
    console.log("Enviando mensagem para o Telegram:", message);
}

export default {receiveAMessage, sendAMessage};