import { z } from 'zod';
import groqService from './groqService';

const { resolveScheduleCommand, groq, hasScheduleCommand } = groqService;

// Estados permitidos no ciclo de vida da conversa
const ALLOWED_STATUS = new Set(['active', 'handover_pending', 'handover_in_progress', 'resolved']);

// Schema para garantir que a IA retorne o formato correto
const interventionSchema = z.object({
  needsIntervention: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

/**
 * Auxiliar para extrair JSON de blocos de Markdown ou texto puro
 */
function extractJson(content) {
  const trimmed = String(content || '').trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return null;
}

/**
 * Filtro de segurança (fallback) baseado em palavras-chave.
 * Atua se a IA estiver fora do ar ou se o usuário for muito explícito.
 */
function hasUrgentKeywords(text) {
  const normalized = String(text || '').toLowerCase();
  const keywords = [
    'atendente', 'humano', 'falar com pessoa', 'suporte', 
    'coordenador', 'gerente', 'reclama', 'ouvidoria', 
    'erro grave', 'urgente', 'ajuda por favor'
  ];
  return keywords.some(keyword => normalized.includes(keyword));
}

/**
 * Analisa o texto do usuário e define se a conversa precisa de intervenção humana.
 * * @param {string} text - O texto enviado pelo remetente.
 * @param {string} [currentStatus='active'] - O status atual da conversa vindo do banco.
 * @returns {Promise<{ status: 'handover_pending' | 'active' | 'handover_in_progress' | 'resolved', isAuto: boolean, reason: string, confidence: number }>}
 */
export async function checkInterventionRequired(text, currentStatus = 'active') {
  // Valida se o status passado é conhecido pelo sistema
  const statusToEvaluate = ALLOWED_STATUS.has(currentStatus) ? currentStatus : 'active';

  // REGRA DE OURO: Se o humano já assumiu ou a conversa foi resolvida, ignora a triagem
  if (statusToEvaluate === 'handover_in_progress' || statusToEvaluate === 'resolved') {
    return {
      status: statusToEvaluate,
      isAuto: false, // Não deve responder automaticamente
      confidence: 1.0,
      reason: `Manutenção de estado: A conversa atualmente está com o status '${statusToEvaluate}'.`,
    };
  }

  const keywordFallback = hasUrgentKeywords(text);

  // Se o Groq não estiver configurado ou disponível, usa o fallback de palavras-chave imediatamente
  if (!groq) {
    const finalStatus = keywordFallback ? 'handover_pending' : 'active';
    return {
      status: finalStatus,
      isAuto: finalStatus === 'active',
      confidence: keywordFallback ? 0.90 : 0.50,
      reason: keywordFallback 
        ? 'Palavra-chave crítica detectada (Fallback sem IA).' 
        : 'Fluxo automatizado mantido (Fallback sem IA).',
    };
  }

  try {
    const response = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `
          Você é um classificador de triagem de suporte especialista em identificar quando um robô (IA) não consegue mais ajudar o usuário e precisa transferir o chat para um atendente humano.

          Retorne APENAS um JSON válido no seguinte formato:
          {
            "needsIntervention": boolean,
            "confidence": number,
            "reason": "string curta explicando o motivo"
          }

          Defina needsIntervention=true (que moverá o chat para 'handover_pending') quando o usuário:
          - Solicitar explicitamente um atendente, humano, suporte, pessoa ou coordenação.
          - Demonstrar forte irritação, fizer uma reclamação grave ou xingar.
          - Indicar que a resposta automática anterior estava errada ou que o bot está em um loop/impasse.
          - Relatar um problema complexo que foge de dúvidas comuns (ex: bugs no sistema, estornos, problemas financeiros).

          Defina needsIntervention=false (que manterá o chat como 'active' / automatizado) quando:
          - For uma dúvida comum, saudações ("olá", "bom dia"), perguntas sobre como funciona, consultas de horários ou agendamentos comuns.

          O campo confidence deve ser um número entre 0 e 1.
          Responda estritamente com o JSON. Não adicione saudações ou explicações fora do objeto.
          `,
        },
        {
          role: 'user',
          content: text,
        },
      ],
    });

    const content = response.choices[0]?.message?.content || '';
    
    const jsonText = extractJson(content); 
    if (!jsonText) throw new Error('JSON não encontrado na resposta do Groq');

    const parsed = JSON.parse(jsonText);
    const validated = interventionSchema.parse(parsed);

    const finalStatus = validated.needsIntervention ? 'handover_pending' : 'active';

    return {
      status: finalStatus,
      isAuto: finalStatus === 'active', // Facilita a checagem no seu código principal
      confidence: validated.confidence,
      reason: validated.reason,
    };

  } catch (error) {
    // Se a IA falhar, o sistema adota o fallback seguro de palavras-chave
    const finalStatus = keywordFallback ? 'handover_pending' : 'active';
    return {
      status: finalStatus,
      isAuto: finalStatus === 'active',
      confidence: keywordFallback ? 0.85 : 0.50,
      reason: keywordFallback 
        ? 'Intervenção ativada por palavras-chave após falha na IA.' 
        : 'Mantido automatizado após falha na IA.',
    };
  }
}