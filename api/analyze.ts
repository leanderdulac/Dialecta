import { streamAnalysis, validateInput, toPublicError, isConfigured, MISSING_KEY_MESSAGE } from "../server/analyze";

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
