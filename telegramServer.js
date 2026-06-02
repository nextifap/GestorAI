import { TelegramClient } from "telegram";
import "dotenv/config";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import input from "input";
import ConversationService from "./src/app/(api)/services/conversationService.js";
import checkAndProcessQueue from "./src/app/(api)/services/telegramQueue.js";

const apiId = parseInt(process.env.TELEGRAM_API_ID, 10);
const apiHash = process.env.TELEGRAM_API_HASH;

if (isNaN(apiId) || !apiHash) {
  console.error("❌ ERRO: Verifique se o TELEGRAM_API_ID e TELEGRAM_API_HASH estão corretos no arquivo .env");
  process.exit(1);
}

const stringSession = new StringSession(process.env.TELEGRAM_STRING_SESSION || "");

const client = new TelegramClient(
  stringSession,
  apiId,
  apiHash,
  {
    connectionRetries: 5,
  }
);

const startServer = async () => {
  console.log("Iniciando cliente do Telegram...");
  
  await client.start({
    phoneNumber: async () => await input.text("Digite seu número de telefone (com +55...): "),
    password: async () => await input.text("Senha 2FA (se houver): "),
    phoneCode: async () => await input.text("Código recebido no Telegram: "),
    onError: (err) => console.log("Erro durante a autenticação:", err),
  });

  // Executa a função a cada 5 segundos (5000 milissegundos)
  setInterval(() => {
    checkAndProcessQueue(client);
  }, 5000);

  console.log("\n🎉 Logado com sucesso!");
  
  if (!process.env.TELEGRAM_STRING_SESSION) {
    console.log("Guarde esta string de sessão no seu .env:\n");
    console.log(client.session.save());
    console.log("\n--------------------------------------------------\n");
  }

  console.log("🎧 Escutando novas mensagens em tempo real...");

  async function eventHandler(event) {
    const message = event.message;

    if (!message.text) return;

    try {
      // 1. Busca os detalhes do remetente usando o ID dele
      const sender = await message.getSender();
      // 2. Extrai o nome (considerando que usuários têm firstName/lastName e canais/grupos têm title)
      const nome = sender.firstName 
        ? `${sender.firstName} ${sender.lastName || ""}`.trim() 
        : sender.title || "Desconhecido";

      // 3. Extrai o número de telefone (só estará disponível se o usuário estiver nos seus contatos ou permitir nas configurações de privacidade)
      const telefone = sender.phone ? `+${sender.phone}` : "Oculto/Não disponível";

      console.log(`\n📬 Nova mensagem recebida!`);
      console.log(`• Nome: ${nome}`);
      console.log(`• Telefone: ${telefone}`);
      console.log(`• Chat ID: ${message.chatId}`);
      console.log(`• Texto: "${message.text}"`);
      console.log(`• Sender ID: ${message.senderId}`);
      console.log(`• HASH: ${sender.accessHash?.toString()}`);
      const conversationServiceInstance = new ConversationService();

      conversationServiceInstance.setClient(client)
      conversationServiceInstance.telegramReceiveMessage2({
        nome,
        telefone,
        accessHash: sender.accessHash?.toString(),
        chatId: message.chatId,
        text: message.text,
        senderId: message.senderId,
        date: message.date
      });
      
    } catch (error) {
      console.error("Erro ao buscar dados do remetente:", error);
    }
  }

  client.addEventHandler(eventHandler, new NewMessage({ incoming: true }));

};

export { startServer };