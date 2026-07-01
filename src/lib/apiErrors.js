import { NextResponse } from 'next/server';

const ERROR_DEFINITIONS = {
  AUTH_MISSING_TOKEN: {
    status: 401,
    message: 'Voce precisa estar logado para continuar.',
  },
  AUTH_INVALID_TOKEN: {
    status: 401,
    message: 'Sua sessao expirou ou e invalida. Faca login novamente.',
  },
  JSON_INVALID: {
    status: 400,
    message: 'Nao foi possivel ler os dados enviados. Verifique e tente novamente.',
  },
  INTERNAL_ERROR: {
    status: 500,
    message: 'Algo deu errado. Tente novamente.',
  },
  TELEGRAM_UNAUTHORIZED: {
    status: 401,
    message: 'Solicitacao nao autorizada.',
  },
  TELEGRAM_INVALID_PAYLOAD: {
    status: 400,
    message: 'Mensagem do Telegram invalida ou incompleta.',
  },
  TELEGRAM_CONFIG_REQUIRED: {
    status: 400,
    message: 'Informe telegramId e telegramHash para atualizar a configuracao do Telegram.',
  },
  TELEGRAM_CHAT_FAILED: {
    status: 500,
    message: 'Nao conseguimos processar sua mensagem agora. Tente novamente.',
  },
  TELEGRAM_SEND_FAILED: {
    status: 500,
    message: 'Nao conseguimos enviar a mensagem pelo Telegram.',
  },
  IMPORT_FILE_MISSING: {
    status: 400,
    message: 'Envie um arquivo para importar.',
  },
  IMPORT_TOO_MANY_ROWS: {
    status: 400,
    message: 'Arquivo muito grande. Limite de 1000 linhas.',
  },
  IMPORT_HEADERS_INVALID: {
    status: 400,
    message: 'A planilha precisa da coluna de titulo (title ou Titulo da Tarefa).',
  },
  IMPORT_NO_VALID_ROWS: {
    status: 400,
    message: 'Nenhuma linha valida encontrada. Revise a planilha.',
  },
  EVENT_IMPORT_FILE_MISSING: {
    status: 400,
    message: 'Envie um arquivo de eventos para importar.',
  },
  EVENT_IMPORT_TOO_MANY_ROWS: {
    status: 400,
    message: 'Arquivo muito grande. Limite de 1000 linhas.',
  },
  EVENT_IMPORT_HEADERS_INVALID: {
    status: 400,
    message: 'A planilha precisa das colunas de nome, data e horario.',
  },
  EVENT_IMPORT_NO_VALID_ROWS: {
    status: 400,
    message: 'Nenhuma linha valida encontrada. Revise a planilha.',
  },
  EVENT_IMPORT_FAILED: {
    status: 500,
    message: 'Nao foi possivel importar a planilha de eventos.',
  },
  EVENTS_FETCH_FAILED: {
    status: 500,
    message: 'Nao foi possivel carregar os eventos.',
  },
  EVENT_VALIDATION_FAILED: {
    status: 400,
    message: 'Dados do evento invalidos. Verifique e tente novamente.',
  },
  EVENT_CREATE_FAILED: {
    status: 500,
    message: 'Nao foi possivel criar o evento.',
  },
  EVENT_NOT_FOUND: {
    status: 404,
    message: 'Evento nao encontrado. Atualize e tente novamente.',
  },
  EVENT_UPDATE_FAILED: {
    status: 500,
    message: 'Nao foi possivel atualizar o evento.',
  },
  EVENT_DELETE_FAILED: {
    status: 500,
    message: 'Nao foi possivel excluir o evento.',
  },
  TASK_CREATE_FAILED: {
    status: 500,
    message: 'Nao foi possivel criar a tarefa. Tente novamente.',
  },
  HANDOVER_QUEUE_FETCH_FAILED: {
    status: 500,
    message: 'Nao foi possivel carregar a fila de handover.',
  },
  HANDOVER_STATUS_INVALID: {
    status: 400,
    message: 'Selecione um status valido para o handover.',
  },
  HANDOVER_NOT_FOUND: {
    status: 404,
    message: 'Conversa nao encontrada. Atualize e tente novamente.',
  },
  HANDOVER_UPDATE_FAILED: {
    status: 500,
    message: 'Nao foi possivel atualizar o handover.',
  },
  EXPORT_FAILED: {
    status: 500,
    message: 'Nao foi possivel exportar as tarefas.',
  },
  CONVERSATIONS_FETCH_FAILED: {
    status: 500,
    message: 'Nao foi possivel carregar o historico.',
  },
  CONVERSATION_CREATE_FAILED: {
    status: 500,
    message: 'Nao foi possivel salvar a conversa.',
  },
  SCHEDULE_DATE_RANGE_INVALID: {
    status: 400,
    message: 'Datas invalidas. Informe um intervalo valido.',
  },
  SCHEDULE_VALIDATION_ERROR: {
    status: 400,
    message: 'Ha dados invalidos. Verifique e tente novamente.',
  },
  SCHEDULE_FETCH_FAILED: {
    status: 500,
    message: 'Nao foi possivel carregar a agenda.',
  },
  SCHEDULE_SLOT_SAVE_FAILED: {
    status: 500,
    message: 'Nao foi possivel salvar o horario.',
  },
  SCHEDULE_SLOT_NOT_FOUND: {
    status: 404,
    message: 'Horario nao encontrado. Atualize a lista.',
  },
  SCHEDULE_SLOT_CONFLICT: {
    status: 409,
    message: 'Ja existe um horario cadastrado nesse periodo.',
  },
  SCHEDULE_SLOT_UPDATE_FAILED: {
    status: 500,
    message: 'Nao foi possivel atualizar o horario.',
  },
  SCHEDULE_SLOT_DELETE_CONFLICT: {
    status: 409,
    message: 'Esse horario ja tem um agendamento aprovado e nao pode ser excluido.',
  },
  SCHEDULE_SLOT_DELETE_FAILED: {
    status: 500,
    message: 'Nao foi possivel excluir o horario.',
  },
  APPOINTMENTS_LIST_FAILED: {
    status: 500,
    message: 'Nao foi possivel carregar as solicitacoes.',
  },
  APPOINTMENT_REQUEST_INVALID: {
    status: 400,
    message: 'Informe gestor, data e horario para continuar.',
  },
  APPOINTMENT_DATE_OR_HOUR_INVALID: {
    status: 400,
    message: 'Data ou horario invalidos.',
  },
  APPOINTMENT_MANAGER_NOT_FOUND: {
    status: 404,
    message: 'Gestor nao encontrado.',
  },
  APPOINTMENT_REQUESTER_NOT_FOUND: {
    status: 404,
    message: 'Nao encontramos seu usuario. Faca login novamente.',
  },
  APPOINTMENT_REQUEST_FORBIDDEN_MANAGER: {
    status: 403,
    message: 'Gestores nao podem solicitar agendamentos.',
  },
  APPOINTMENT_REQUEST_FORBIDDEN_SELF: {
    status: 403,
    message: 'Voce nao pode agendar com voce mesmo.',
  },
  APPOINTMENT_DUPLICATE: {
    status: 409,
    message: 'Voce ja solicitou esse horario. Aguarde a resposta do gestor.',
  },
  APPOINTMENT_DATE_BLOCKED: {
    status: 409,
    message: 'Escolha uma data futura para o agendamento.',
  },
  APPOINTMENT_SLOT_UNAVAILABLE: {
    status: 409,
    message: 'Esse horario nao esta disponivel.',
  },
  APPOINTMENT_CREATE_FAILED: {
    status: 500,
    message: 'Nao foi possivel criar sua solicitacao. Tente novamente.',
  },
  APPOINTMENT_ACTION_INVALID: {
    status: 400,
    message: 'Selecione uma acao valida.',
  },
  APPOINTMENT_REJECT_REASON_REQUIRED: {
    status: 400,
    message: 'Informe o motivo da recusa.',
  },
  APPOINTMENT_NOT_FOUND: {
    status: 404,
    message: 'Solicitacao nao encontrada. Atualize e tente novamente.',
  },
  APPOINTMENT_ALREADY_PROCESSED: {
    status: 409,
    message: 'Essa solicitacao ja foi analisada.',
  },
  APPOINTMENT_APPROVAL_CONFLICT: {
    status: 409,
    message: 'Esse horario ja esta indisponivel.',
  },
  APPOINTMENT_PROCESS_FAILED: {
    status: 500,
    message: 'Nao foi possivel processar a solicitacao.',
  },
  CONTACTS_FETCH_FAILED: {
    status: 500,
    message: 'Nao foi possivel carregar os contatos.',
  },
  CHAT_METHOD_NOT_ALLOWED: {
    status: 405,
    message: 'Use o metodo POST para enviar mensagens.',
  },
  CHAT_BAD_JSON: {
    status: 400,
    message: 'Nao conseguimos ler sua mensagem. Tente novamente.',
  },
  CHAT_MISSING_FIELDS: {
    status: 400,
    message: 'Faltam dados para enviar a mensagem. Tente novamente.',
  },
  CHAT_CONVERSATION_NOT_FOUND: {
    status: 404,
    message: 'Conversa nao encontrada. Atualize e tente novamente.',
  },
  CHAT_INTERNAL_ERROR: {
    status: 500,
    message: 'Tivemos um problema ao processar sua mensagem.',
  },
  CHAT_MESSAGES_FETCH_FAILED: {
    status: 500,
    message: 'Nao foi possivel carregar as mensagens.',
  },
  AUTH_LOGIN_INVALID: {
    status: 401,
    message: 'Email ou senha incorretos.',
  },
  AUTH_LOGIN_PASSWORD_MISSING: {
    status: 500,
    message: 'Este usuario nao possui senha cadastrada. Tente recuperar a conta.',
  },
  AUTH_FORBIDDEN: {
    status: 403,
    message: 'Voce nao tem permissao para esta acao.',
  },
  AUTH_USER_NOT_FOUND: {
    status: 401,
    message: 'Usuario nao encontrado. Faca login novamente.',
  },
  AUTH_CREDENTIALS_REQUIRED: {
    status: 400,
    message: 'Informe email e senha para continuar.',
  },
  AUTH_REGISTER_DISABLED: {
    status: 403,
    message: 'Cadastro desativado. Procure o administrador.',
  },
  AUTH_REGISTER_PASSWORD_MISMATCH: {
    status: 400,
    message: 'As senhas informadas nao sao iguais.',
  },
  AUTH_REGISTER_EMAIL_IN_USE: {
    status: 409,
    message: 'Este email ja esta cadastrado. Faca login ou recupere a senha.',
  },
  AUTH_REGISTER_FAILED: {
    status: 500,
    message: 'Algo deu errado. Tente novamente.',
  },
  USERS_LIST_FAILED: {
    status: 500,
    message: 'Nao foi possivel carregar os usuarios.',
  },
  USERS_CREATE_FAILED: {
    status: 500,
    message: 'Nao foi possivel criar o usuario.',
  },
  USERS_UPDATE_FAILED: {
    status: 500,
    message: 'Nao foi possivel atualizar o usuario.',
  },
  USERS_DELETE_FAILED: {
    status: 500,
    message: 'Nao foi possivel excluir o usuario.',
  },
  USER_SELF_DELETE_FORBIDDEN: {
    status: 403,
    message: 'Voce nao pode excluir seu proprio usuario.',
  },
};

function resolveDefinition(code) {
  return ERROR_DEFINITIONS[code] || ERROR_DEFINITIONS.INTERNAL_ERROR;
}

export function buildErrorPayload(code, options = {}) {
  const definition = resolveDefinition(code);
  const status = options.status ?? definition.status;
  const message = options.message ?? definition.message;
  const error = { code, message };

  if (typeof options.details !== 'undefined') {
    error.details = options.details;
  }

  return { status, error };
}

export function errorResponse(code, options) {
  const { status, error } = buildErrorPayload(code, options);
  return NextResponse.json({ error }, { status });
}

export function respondAuthError(result) {
  if (!result || result.status === 200) {
    return null;
  }

  return errorResponse(result.errorCode || 'AUTH_INVALID_TOKEN');
}
