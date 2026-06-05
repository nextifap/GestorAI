import clients from "@/lib/see-clients";

/**
 * 
 * Endpoint para receber mensagem do Telegram
 * 
 * @param {*} message 
 */
export async function GET() {
    const stream = new ReadableStream({
        start(controller) {
            clients.add(controller);
            let data = {connected: true};
            controller.enqueue(
                `data: ${JSON.stringify(data)}\n\n`
            );
        },

        cancel(controller) {
            // clients.delete(controller);
        },
    });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}