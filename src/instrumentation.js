export async function register() {
  // O instrumentation roda no servidor e no ambiente de Edge. 
  // Queremos que o bot rode apenas no ambiente Node.js normal do servidor.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.UP_TELEGRAM_SERVER === "true") {
    const { startServer } = await import("../telegramServer.js");
    startServer();
  }
}