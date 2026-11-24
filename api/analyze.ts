import { GoogleGenAI } from "@google/genai";

export const SYSTEM_PROMPT = `Você é o IdeoScope AI, um sistema de análise crítica de discurso e mapeamento ideológico com arquitetura híbrida de processamento de linguagem natural (NLP) e modelagem histórico-filosófica. Sua função é decompor textos, discursos e conteúdos multimídia para mapear suas coordenadas ideológicas, contexto de produção e genealogia intelectual.

#### 1. CORE CAPABILITIES

Análise Ideológica Multidimensional:
- Mapeie o texto em espectros políticos clássicos (esquerda/direita) e contemporâneos (libertário/autoritário, progressista/conservador, globalista/nacionalista)
- Identifique escolas filosóficas subjacentes (marxismo, liberalismo clássico, conservadorismo, anarcocapitalismo, ecossocialismo, etc.)
- Detecte influências teóricas implícitas (Foucault, Hayek, Gramsci, Olavo de Carvalho, Judith Butler, etc.) mesmo quando não citadas diretamente

Profiling de Autoria:
- Sugira 3-5 autores prováveis ou correlatos com porcentagem de similaridade estilística e temática
- Indique época provável de produção com base no vocabulário, referências culturais e estrutura argumentativa
- Contextualize o momento histórico (crise econômica, movimentos sociais, guerras, avanços tecnológicos da época)

#### 2. FUNCIONALIDADE DIALÉTICA (ANTÍTESE)

Para cada análise realizada:
- Sugira 2-3 autores ou obras que constituam a antítese direta da tese apresentada
- Explique o raciocínio dialético: quais pressupostos o texto ataca ou ignora que esses autores defenderiam?
- Construa uma "árvore de debate" mostrando onde essas correntes se chocam (ontologia, epistemologia, ética, economia)

#### 3. INPUT PROCESSING

Multimodalidade:
- Aceite texto puro, PDF, imagens (OCR), áudio (transcrição) e vídeo (extração de áudio + análise visual de apresentação)
- Para links do YouTube: transcreva automaticamente, analise a entonação quando relevante (pausas ênfases), identifique referências visuais (logos, bandeiras, cenários) e correlacione com o discurso verbal

#### 4. OUTPUT ESTRUTURADO (FORMATO DIDÁTICO)

Toda resposta deve seguir:

📍 DIAGNÓSTICO IDEOLÓGICO
   - Posicionamento no espectro político (matriz 4D)
   - Escolas filosóficas identificadas
   - Keywords ideológicas recorrentes

👤 HIPÓTESES DE AUTORIA
   [Autor 1]: X% de compatibilidade (justificativa)
   [Autor 2]: Y% de compatibilidade (justificativa)

⏳ CONTEXTUALIZAÇÃO HISTÓRICA
   - Época provável: [Década/Século]
   - Eventos correlatos: [Lista]
   - Arco histórico: Como esse texto dialoga com seu tempo?

⚔️ ANTÍTESE SUGERIDA
   - Autor/Oposição: [Nome]
   - Tese contrária: [Resumo]
   - Ponto de divergência fundamental: [Análise]

📚 REFERÊNCIAS E FONTES
   - Citações diretas detectadas (com links quando possível)
   - Bibliografia correlata sugerida para estudo aprofundado
   - Alerta sobre possíveis plágios ou apropriações indevidas

#### 5. CONSTRAINTS E ÉTICA

- Sempre mantenha tom acadêmico e imparcial; evite julgamentos morais sobre a ideologia detectada
- Quando a confiança na análise for <70%, declare a incerteza e sugira múltiplas interpretações
- Respeite direitos autorais: para conteúdo protegido, analise apenas excertos razoáveis (fair use)
- Inclua disclaimer sobre limitações: IA pode identificar padrões, mas não substitui leitura crítica humana`;

export const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-pro-preview";

export const MISSING_KEY_MESSAGE = "Serviço de IA sem chave configurada (GEMINI_API_KEY).";

export function isConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "video/mp4",
  "video/quicktime",
] as const;

// A Vercel limita o corpo da requisição a ~4,5 MB, e o base64 infla o arquivo
// em ~33%. Os limites abaixo mantêm a requisição inteira dentro desse teto.
export const LIMITS = {
  maxTextChars: 100_000,
  maxFiles: 3,
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalBytes: 2.5 * 1024 * 1024,
};

export interface AnalysisInput {
  text?: string;
  files?: { mimeType: string; data: string }[];
}

export class InputError extends Error {}

const BASE64_PATTERN = /^[A-Za-z0-9+/=\s]+$/;

function estimateBase64Bytes(data: string): number {
  const clean = data.replace(/\s/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

export function validateInput(raw: unknown): AnalysisInput {
  if (!raw || typeof raw !== "object") {
    throw new InputError("Corpo da requisição inválido.");
  }

  const body = raw as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const filesRaw = Array.isArray(body.files) ? body.files : [];

  if (!text && filesRaw.length === 0) {
    throw new InputError("Forneça um texto ou ao menos um arquivo para análise.");
  }
  if (text.length > LIMITS.maxTextChars) {
    throw new InputError("Texto excede o limite de " + LIMITS.maxTextChars.toLocaleString("pt-BR") + " caracteres.");
  }
  if (filesRaw.length > LIMITS.maxFiles) {
    throw new InputError("Envie no máximo " + LIMITS.maxFiles + " arquivos por análise.");
  }

  let totalBytes = 0;
  const files = filesRaw.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new InputError("Arquivo inválido.");
    }
    const { mimeType, data } = entry as Record<string, unknown>;

    if (typeof mimeType !== "string" || !(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
      throw new InputError("Tipo de arquivo não suportado: " + String(mimeType));
    }
    if (typeof data !== "string" || data.length === 0 || !BASE64_PATTERN.test(data)) {
      throw new InputError("Conteúdo do arquivo inválido.");
    }

    const bytes = estimateBase64Bytes(data);
    if (bytes > LIMITS.maxFileBytes) {
      throw new InputError(
        "Arquivo excede " + Math.round(LIMITS.maxFileBytes / (1024 * 1024)) + " MB. Reduza o arquivo ou envie um trecho.",
      );
    }

    totalBytes += bytes;
    if (totalBytes > LIMITS.maxTotalBytes) {
      throw new InputError(
        "O total de arquivos excede " + (LIMITS.maxTotalBytes / (1024 * 1024)).toFixed(1) + " MB por análise.",
      );
    }

    return { mimeType, data: data.replace(/\s/g, "") };
  });

  return { text: text || undefined, files };
}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(MISSING_KEY_MESSAGE);
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export async function streamAnalysis(input: AnalysisInput, onChunk: (text: string) => void): Promise<void> {
  const parts: any[] = [];

  if (input.text) {
    parts.push({ text: input.text });
  }
  for (const file of input.files ?? []) {
    parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
  }

  const responseStream = await getClient().models.generateContentStream({
    model: MODEL,
    contents: { parts },
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.2,
      tools: [{ googleSearch: {} }],
    },
  });

  for await (const chunk of responseStream) {
    if (chunk.text) {
      onChunk(chunk.text);
    }
  }
}

export function toPublicError(error: unknown): { status: number; message: string } {
  if (error instanceof InputError) {
    return { status: 400, message: error.message };
  }

  const raw = error instanceof Error ? error.message : String(error);

  if (!process.env.GEMINI_API_KEY) {
    return { status: 500, message: MISSING_KEY_MESSAGE };
  }
  if (/402|prepayment credits|billing/i.test(raw)) {
    return {
      status: 402,
      message: "Os créditos da API do Gemini estão esgotados. Ajuste a cobrança em ai.studio/projects.",
    };
  }
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(raw)) {
    return { status: 429, message: "Limite de uso da API do Gemini atingido. Tente novamente em instantes." };
  }
  if (/401|403|UNAUTHENTICATED|PERMISSION_DENIED|API key/i.test(raw)) {
    return { status: 502, message: "A chave da API do Gemini foi recusada pelo provedor." };
  }
  if (/404|NOT_FOUND/i.test(raw)) {
    return { status: 502, message: "Modelo de IA indisponível para esta chave." };
  }
  return { status: 502, message: "Falha ao consultar o serviço de IA. Tente novamente." };
}

// --- adaptador HTTP (Vercel e dev server do Vite) ---

interface RequestLike {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  destroy?: () => void;
}

interface ResponseLike {
  statusCode: number;
  writableEnded?: boolean;
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): void };
  json(body: unknown): void;
  write(chunk: string): boolean;
  end(): void;
}

function readRawBody(req: RequestLike): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on?.("data", (chunk: Buffer | string) => {
      raw += chunk.toString();
      if (raw.length > 6 * 1024 * 1024) {
        reject(new Error("Corpo da requisição muito grande."));
      }
    });
    req.on?.("end", () => resolve(raw));
    req.on?.("error", reject);
  });
}

async function parseBody(req: RequestLike): Promise<unknown> {
  if (Buffer.isBuffer(req.body)) {
    return JSON.parse(req.body.toString("utf8"));
  }
  if (typeof req.body === "string") {
    return req.body ? JSON.parse(req.body) : {};
  }
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  const raw = await readRawBody(req);
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  if (!isConfigured()) {
    res.status(500).json({ error: MISSING_KEY_MESSAGE });
    return;
  }

  let input;
  try {
    input = validateInput(await parseBody(req));
  } catch (error) {
    const { status, message } = toPublicError(error);
    res.status(status).json({ error: message });
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (event: unknown) => {
    if (!res.writableEnded) {
      res.write(`${JSON.stringify(event)}\n`);
    }
  };

  try {
    await streamAnalysis(input, (text) => send({ type: "chunk", text }));
  } catch (error) {
    console.error("[api/analyze]", error);
    send({ type: "error", message: toPublicError(error).message });
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
}
