var chatConnection = {};

export default function initChatMessageEventSource() {

  console.log("Iniciado o initChatMessageEventSource");

  const events = new EventSource('/api/chat/stream');

  events.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const { chatId, message } = data;

      chatConnection = {
        checkedAt: new Date()
      };

      console.log(`Nova mensagem para o chat ${chatId}:`, message);
    } catch (error) {
      console.error("Erro ao processar a mensagem do evento:", error);
    }
  };
}