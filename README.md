# Dialecta — IdeoScope AI

Análise crítica de discurso e mapeamento ideológico, com leitura de texto, URL e arquivos (PDF, imagem, áudio e vídeo).

## Como funciona

O navegador nunca vê a chave da API. O frontend envia o material para `/api/analyze`, uma função serverless que chama o Google Gemini e devolve a resposta em streaming.

- `src/` — interface React (Vite + Tailwind).
- `api/analyze.ts` — função serverless com prompt, validação e chamada ao Gemini.
  Fica num arquivo só porque a Vercel compila cada função isoladamente; o dev
  server do Vite reaproveita o mesmo módulo.

## Rodar localmente

```bash
npm install
cp .env.example .env   # preencha GEMINI_API_KEY
npm run dev
```

Acesse `http://localhost:3000`. Em desenvolvimento o próprio Vite serve `/api/analyze`.

## Publicar na Vercel

1. Importe o repositório em [vercel.com/new](https://vercel.com/new). O framework é detectado como Vite; não mude o build (`npm run build`, saída em `dist`).
2. Em **Settings → Environment Variables**, adicione `GEMINI_API_KEY` (somente servidor, sem prefixo `VITE_`) e aplique em Production, Preview e Development.
3. Faça o deploy. A chave fica disponível apenas nas funções de `api/`, nunca no bundle do navegador.

## Limites

A Vercel aceita no máximo ~4,5 MB por requisição, e o base64 cresce ~33%. Por isso: até 3 arquivos, 2 MB cada, 2,5 MB no total, e textos até 100 mil caracteres. Para mídia maior, recorte o trecho ou envie o texto da transcrição.
