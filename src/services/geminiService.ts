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

// Mantido em sincronia com api/upload.ts e api/analyze.ts. Cada arquivo sobe em
// uma requisição própria para a Files API do Gemini, então o teto de ~4,5 MB da
// Vercel vale por arquivo, não pelo conjunto.
export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_TEXT_CHARS = 300_000;

export interface StoredFile {
  uri: string;
  mimeType: string;
  name: string;
  sizeBytes: number;
}

export interface AnalysisInput {
  text?: string;
  files?: File[];
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
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new Error(`Tipo de arquivo não suportado: ${file.type || file.name}`);
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`O arquivo excede ${MAX_FILE_BYTES / (1024 * 1024)} MB. Reduza o arquivo ou envie um trecho.`);
    }
  }
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json();
    if (data?.error) return String(data.error);
  } catch {
    // resposta sem JSON: mantém a mensagem genérica
  }
  return fallback;
}

export async function uploadFile(file: File): Promise<StoredFile> {
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Falha ao enviar "${file.name}" (HTTP ${response.status}).`));
  }

  const stored = (await response.json()) as StoredFile;
  if (!stored?.uri) {
    throw new Error(`O envio de "${file.name}" não devolveu uma referência válida.`);
  }
  return stored;
}

export async function analyzeContent(
  input: AnalysisInput,
  onChunk: (text: string) => void,
  onUploadProgress?: (done: number, total: number, fileName: string) => void,
): Promise<void> {
  validateLocally(input);

  const files = input.files ?? [];
  const stored: StoredFile[] = [];

  for (let index = 0; index < files.length; index += 1) {
    onUploadProgress?.(index, files.length, files[index].name);
    stored.push(await uploadFile(files[index]));
  }
  onUploadProgress?.(files.length, files.length, '');

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson',
    },
    body: JSON.stringify({
      text: input.text,
      files: stored.map(({ uri, mimeType, name }) => ({ uri, mimeType, name })),
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Falha na análise (HTTP ${response.status}).`));
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
