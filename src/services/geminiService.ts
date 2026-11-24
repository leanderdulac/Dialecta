export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
  'video/mp4',
  'video/quicktime',
];

// Mantido em sincronia com os limites de server/analyze.ts: a Vercel recusa
// requisições acima de ~4,5 MB, por isso o aviso acontece antes do envio.
export const MAX_FILES = 3;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_TEXT_CHARS = 100_000;

export interface AnalysisInput {
  text?: string;
  files?: { mimeType: string; data: string }[];
}

function validateLocally(input: AnalysisInput): void {
  const files = input.files ?? [];

  if (!input.text && files.length === 0) {
    throw new Error('Forneça um texto ou ao menos um arquivo para análise.');
  }
  if (input.text && input.text.length > MAX_TEXT_CHARS) {
    throw new Error(`Texto excede o limite de ${MAX_TEXT_CHARS.toLocaleString('pt-BR')} caracteres.`);
  }
  if (files.length > MAX_FILES) {
    throw new Error(`Envie no máximo ${MAX_FILES} arquivos por análise.`);
  }

  for (const file of files) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimeType)) {
      throw new Error(`Tipo de arquivo não suportado: ${file.mimeType}`);
    }
    const bytes = Math.floor((file.data.length * 3) / 4);
    if (bytes > MAX_FILE_BYTES) {
      throw new Error(`O arquivo excede ${MAX_FILE_BYTES / (1024 * 1024)} MB. Reduza o arquivo ou envie um trecho.`);
    }
  }
}

export async function analyzeContent(input: AnalysisInput, onChunk: (text: string) => void): Promise<void> {
  validateLocally(input);

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson',
    },
    body: JSON.stringify({ text: input.text, files: input.files ?? [] }),
  });

  if (!response.ok) {
    let message = `Falha na análise (HTTP ${response.status}).`;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // resposta sem JSON: mantém a mensagem genérica
    }
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error('Resposta de análise vazia.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event: { type?: string; text?: string; message?: string };
    try {
      event = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (event.type === 'chunk' && event.text) {
      onChunk(event.text);
    } else if (event.type === 'error') {
      throw new Error(event.message || 'Falha durante a análise.');
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(handleLine);
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    handleLine(buffer);
  }
}
