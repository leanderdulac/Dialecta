# Dialecta AI

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

Acesse `http://localhost:3000`. Em desenvolvimento o próprio Vite serve `/api/analyze` e `/api/upload`.

## Publicar na Vercel

1. Importe o repositório em [vercel.com/new](https://vercel.com/new). O framework é detectado como Vite; não mude o build (`npm run build`, saída em `dist`).
2. Em **Settings → Environment Variables**, adicione `GEMINI_API_KEY` (somente servidor, sem prefixo `VITE_`) e aplique em Production, Preview e Development.
3. Faça o deploy. A chave fica disponível apenas nas funções de `api/`, nunca no bundle do navegador.

## Limites

A Vercel corta o corpo de cada requisição em ~4,5 MB. Para não perder qualidade nem esbarrar nesse teto, cada arquivo sobe em uma requisição própria (`/api/upload`) que o repassa à Files API do Gemini; `/api/analyze` recebe apenas texto e as referências dos arquivos já enviados.

Por isso os limites são: até 10 arquivos, 4 MB cada (sem teto de soma), e textos até 300 mil caracteres. A análise de mídia grande consome mais tempo, e cada função tem 60 segundos de execução.

