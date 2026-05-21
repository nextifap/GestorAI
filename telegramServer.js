import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";

const apiId = SEU_API_ID;
const apiHash = "SEU_API_HASH";

const stringSession = new StringSession("");

const client = new TelegramClient(
  stringSession,
  apiId,
  apiHash,
  {
    connectionRetries: 5,
  }
);

await client.start({
  phoneNumber: async () => await input.text("Número: "),
  password: async () => await input.text("Senha 2FA: "),
  phoneCode: async () => await input.text("Código: "),
  onError: (err) => console.log(err),
});

console.log("Logado!");

console.log(client.session.save());