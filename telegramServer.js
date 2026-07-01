import { TelegramClient, Api } from "telegram";
import "dotenv/config";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import input from "input";
import ConversationService from "./src/app/(api)/services/conversationService.js";
import checkAndProcessQueue from "./src/app/(api)/services/telegramQueue.js";
import prisma from "./src/lib/prisma.js";

const getConfig = async () => {
  let config = await prisma.telegramConfig.findFirst({
    orderBy: { id: "desc" },
  })

  if (!config) {
    config = await prisma.telegramConfig.create({
      data: {
        apiTelegramId: "1111",
        apiTelegramHash: "abc",
      },
    })
  }

  return config
}

var telegramConfig = await getConfig();
var apiId = parseInt(telegramConfig?.apiTelegramId);
var apiHash = telegramConfig?.apiTelegramHash;
var checkHealthStatusId = null;
var iniciarKeepAliveId = null;
var stringSession = telegramConfig?.apiTelegramSession;

const getClient = async () => {
  var client_ = null;

  if (isNaN(apiId) || !apiHash) {
    console.error("❌ ERRO: Verifique se o TELEGRAM_API_ID e TELEGRAM_API_HASH estão corretos no arquivo .env");
    return null;
  }

  try {
    client_ = new TelegramClient(new StringSession(stringSession), apiId, apiHash, {
      connectionRetries: 5,
    })
  } catch (err) {
    await updateConfigInDatabase(telegramConfig.id, {
      error: err.message,
      apiTelegramSession: null,
      step: 'ERROR'
    })

    console.error("❌ ERRO:", err.message)
  }

  return client_
};

const client = await getClient();

const restartServer = async (telegramConfig) => { 
  console.log("Reiniciando servidor do Telegram...");
  if (!client) return;
  
  // Desconecta
  await client.disconnect();
  // Reset dados do banco
  await updateConfigInDatabase(telegramConfig.id, { apiTelegramSession: null, error: null, step: 'DISCONNECTED' });
  // Inicializa o Server
  await startServer(telegramConfig);
}

const startServer = async () => {
  if (!client) return;

  iniciarKeepAlive(client);
  checkHealthStatus(); 
  telegramConfig = telegramConfig || await getConfig();
  console.log("Iniciando cliente do Telegram...");

  if (!telegramConfig?.apiTelegramSession) {
    if (!telegramConfig || !telegramConfig.apiTelegramHash || !telegramConfig.apiTelegramId || !telegramConfig.phoneNumber) {
      let error = "Verifique se o TELEGRAM_API_ID, TELEGRAM_API_HASH, o número de telefone e a senha estão corretos no banco de dados";
      if (telegramConfig) updateConfigInDatabase(telegramConfig.id, { error: error });
      console.log("❌ ERRO: " + error);
      return
    }
  }
    
  await client.start({
    phoneNumber: async () => telegramConfig.phoneNumber,
    password: async () => {
      updateConfigInDatabase(telegramConfig.id, { error: "Insira a senha e tente novamente ...", step: 'PASSWORD' });
    },
    phoneCode: async () => await waitForPhoneCode(telegramConfig.id),
    onError: (err) => {
      updateConfigInDatabase(telegramConfig.id, { error: err.message, apiTelegramSession: null, step: 'ERROR' });
    },
  });

  // Executa a função a cada 5 segundos (5000 milissegundos)
  setInterval(() => {
    checkAndProcessQueue(client);
  }, 5000);

  console.log("\n🎉 Logado com sucesso!");
  
  // Session salva no banco de dados para reconectar automaticamente na próxima vez
  await updateConfigInDatabase(telegramConfig.id, { apiTelegramSession: client.session.save(), step: 'CONNECTED' });

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

      const hostTelegramId = await client.getMe();

      conversationServiceInstance.telegramReceiveMessage2({
        nome,
        telefone,
        accessHash: sender.accessHash?.toString(),
        chatId: message.chatId,
        text: message.text,
        senderId: message.senderId,
        date: message.date,
        hostTelegramId: hostTelegramId.id.toString(),
      });
      
    } catch (error) {
      console.error("Erro ao buscar dados do remetente:", error);
    }
  }

  client.addEventHandler(eventHandler, new NewMessage({ incoming: true }));

};

const checkHealthStatus = () => {
  clearInterval(checkHealthStatusId);

  checkHealthStatusId = setInterval(() => {
    var status = "PENDING";
  
    if (!(client.session && client.session.authKey)) {
      status = "DISCONNECTED";
    } else if (client.connected) {
      status = "CONNECTED";
    } else {
      status = "DISCONNECTED";
    }
    
    prisma.TelegramHealthStatus.create({
      data: {status: status},
    }).catch((err) => {
      console.error("Erro ao atualizar status de saúde no banco:", err);
    });
  }, 1000 * 60 * 5);
}

// Função para manter a conexão ativa
function iniciarKeepAlive(client) {
  clearInterval(iniciarKeepAliveId);

    iniciarKeepAliveId = setInterval(async () => {
        if (client && client.connected) {
            try {
                // Envia uma requisição super leve apenas para dizer "estou aqui"
                await client.invoke(new Api.help.GetConfig());
                console.log("[Keep-Alive] Ping enviado com sucesso.");
            } catch (error) {
                console.error("[Keep-Alive] Erro ao pingar o Telegram:", error.message);
            }
        }
    }, 1000 * 60 * 3); // Executa a cada 3 minutos
}

async function updateConfigInDatabase(id, data) {
  await prisma.telegramConfig.update({
    where: {
      id: id,
    },
    data: data,
  })
}

const waitForPhoneCode = async (id) => {
  const start = Date.now()
  const timeout = 5 * 60 * 1000 // 5 minutos

  while (true) {
    await updateConfigInDatabase(id, { error: "Informe o código 2AF...", step: 'CODE' });
    
    const config = await prisma.telegramConfig.findFirst({
      where: { id: id },
      select: { phoneCode: true },
    });

    if (config?.phoneCode) {
      return config.phoneCode
    }

    if (Date.now() - start > timeout) {
      updateConfigInDatabase(id, { error: "Timeout: código não recebido em 5 minutos"});
      return;
    }

    await new Promise((r) => setTimeout(r, 8000)) // 8s
  }
}

export { startServer, restartServer };