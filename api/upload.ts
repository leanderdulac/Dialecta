import { GoogleGenAI } from "@google/genai";

// Este arquivo é compilado isolado pela Vercel (sem imports relativos fora de api/),
// por isso o allowlist e o cliente do Gemini são repetidos aqui.

export const MISSING_KEY_MESSAGE = "Serviço de IA sem chave configurada (GEMINI_API_KEY).";

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

// A Vercel corta o corpo de cada requisição em ~4,5 MB; 4 MB deixa margem para
// cabeçalhos. Como cada arquivo viaja em sua própria requisição e vai direto
// para a Files API do Gemini, o tamanho total da análise não é mais limitado
// por esse teto.
export const UPLOAD_LIMITS = {
  maxFileBytes: 4 * 1024 * 1024,
};

const MAX_FILE_BYTES_PER_REQUEST = 5 * 1024 * 1024;

export class UploadError extends Error {}

export interface StoredFile {
  uri: string;
  mimeType: string;
  name: string;
  sizeBytes: number;
}

export function validateUpload(mimeType: string, size: number): void {
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new UploadError("Tipo de arquivo não suportado: " + (mimeType || "desconhecido"));
  }
  if (size === 0) {
    throw new UploadError("Arquivo vazio.");
  }
  if (size > UPLOAD_LIMITS.maxFileBytes) {
    throw new UploadError(
      "Arquivo excede " + Math.round(UPLOAD_LIMITS.maxFileBytes / (1024 * 1024)) + " MB. Reduza o arquivo ou envie um trecho.",
    );
  }
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

const ACTIVE_POLL_INTERVAL_MS = 1_000;
const ACTIVE_POLL_TIMEOUT_MS = 25_000;

export async function storeFile(data: Uint8Array, mimeType: string, displayName?: string): Promise<StoredFile> {
  validateUpload(mimeType, data.byteLength);

  const ai = getClient();
  const uploaded = await ai.files.upload({
    file: new Blob([data], { type: mimeType }),
    config: { mimeType, displayName },
  });

  if (!uploaded.name) {
    throw new UploadError("O provedor não devolveu a referência do arquivo.");
  }

  // Áudio e vídeo entram em processamento e só podem ser usados quando ficam ACTIVE.
  let state = uploaded.state;
  let current = uploaded;
  const deadline = Date.now() + ACTIVE_POLL_TIMEOUT_MS;

  while (state === "PROCESSING" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, ACTIVE_POLL_INTERVAL_MS));
    current = await ai.files.get({ name: uploaded.name });
    state = current.state;
  }

  if (state !== "ACTIVE" || !current.uri) {
    throw new UploadError("O provedor não conseguiu processar o arquivo. Tente outro formato ou um trecho menor.");
  }

  return {
    uri: current.uri,
    mimeType: current.mimeType || mimeType,
    name: current.name || uploaded.name,
    sizeBytes: Number(current.sizeBytes ?? data.byteLength),
  };
}

export function toPublicError(error: unknown): { status: number; message: string } {
  if (error instanceof UploadError) {
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
  return { status: 502, message: "Falha ao enviar o arquivo para o serviço de IA. Tente novamente." };
}

// --- adaptador HTTP (Vercel e dev server do Vite) ---

interface RequestLike {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  on?: (event: string, listener: (...args: any[]) => void) => void;
}

interface ResponseLike {
  statusCode: number;
  setHeader(name: string, value: string | number): void;
  status(code: number): { json(body: unknown): void };
  json(body: unknown): void;
  end(): void;
}

export function readRawBytes(req: RequestLike): Promise<Uint8Array> {
  if (Buffer.isBuffer(req.body)) {
    return Promise.resolve(new Uint8Array(req.body));
  }
  if (req.body instanceof Uint8Array) {
    return Promise.resolve(req.body);
  }

  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let total = 0;

    req.on?.("data", (chunk: Buffer | string) => {
      const bytes = typeof chunk === "string" ? new Uint8Array(Buffer.from(chunk)) : new Uint8Array(chunk);
      total += bytes.byteLength;
      if (total > MAX_FILE_BYTES_PER_REQUEST) {
        reject(new UploadError("Arquivo excede o limite de envio."));
        return;
      }
      chunks.push(bytes);
    });
    req.on?.("end", () => {
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const bytes of chunks) {
        merged.set(bytes, offset);
        offset += bytes.byteLength;
      }
      resolve(merged);
    });
    req.on?.("error", reject);
  });
}

function headerValue(req: RequestLike, name: string): string {
  const raw = req.headers?.[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value ?? "").split(";")[0].trim().toLowerCase();
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    res.status(500).json({ error: MISSING_KEY_MESSAGE });
    return;
  }

  const mimeType = headerValue(req, "content-type");
  const displayName = decodeURIComponent(headerValue(req, "x-file-name") || "");

  let bytes: Uint8Array;
  try {
    bytes = await readRawBytes(req);
  } catch {
    res.status(413).json({ error: "Arquivo grande demais para envio." });
    return;
  }

  try {
    const stored = await storeFile(bytes, mimeType, displayName || undefined);
    res.status(200).json(stored);
  } catch (error) {
    console.error("[api/upload]", error);
    const { status, message } = toPublicError(error);
    res.status(status).json({ error: message });
  }
}
