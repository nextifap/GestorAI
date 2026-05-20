if (!globalThis.sseClients) {
  globalThis.sseClients = new Set();
}

const clients = globalThis.sseClients;

export default clients;