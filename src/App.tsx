import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Link as LinkIcon,
  Loader2,
  Moon,
  Search,
  Sparkles,
  Sun,
  Upload,
  X,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { analyzeContent, ALLOWED_MIME_TYPES, MAX_FILES, MAX_FILE_BYTES, MAX_TEXT_CHARS } from './services/geminiService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const cardClass =
  'flex flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/80 shadow-sm backdrop-blur-xl transition-colors dark:border-white/10 dark:bg-white/[0.025]';

const fieldClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-indigo-400/70 dark:focus:ring-indigo-500/15';

const labelClass = 'flex items-center gap-2 text-[13px] font-medium text-zinc-700 dark:text-zinc-300';

export default function App() {
  const [textInput, setTextInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [uploadLabel, setUploadLabel] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('dialecta-theme') : null;
    if (saved === 'light') return false;
    if (saved === 'dark') return true;
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.documentElement.style.colorScheme = isDarkMode ? 'dark' : 'light';
    localStorage.setItem('dialecta-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
  }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTextInput(e.target.value);
    setIsTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 1000);
  };

  const addFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;

    const maxMb = MAX_FILE_BYTES / (1024 * 1024);
    const accepted: File[] = [];
    const problems: string[] = [];

    for (const file of incoming) {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        problems.push(`${file.name}: tipo não suportado`);
      } else if (file.size > MAX_FILE_BYTES) {
        problems.push(`${file.name}: acima de ${maxMb} MB`);
      } else {
        accepted.push(file);
      }
    }

    const room = Math.max(0, MAX_FILES - files.length);
    if (accepted.length > room) {
      problems.push(`máximo de ${MAX_FILES} arquivos por análise`);
    }

    setFiles([...files, ...accepted.slice(0, room)]);
    setError(problems.length > 0 ? `Não enviado — ${problems.join('; ')}.` : null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files ?? []));
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    if (!textInput && !urlInput && files.length === 0) {
      setError('Forneça um texto, URL ou arquivo para análise.');
      return;
    }

    setIsAnalyzing(true);
    setResult('');
    setError(null);
    setUploadLabel(null);
    resultScrollRef.current?.scrollTo({ top: 0 });

    try {
      let combinedText = textInput;
      if (urlInput) {
        try {
          new URL(urlInput);
          combinedText += `\n\nURL para análise: ${urlInput}`;
        } catch {
          throw new Error('URL inválida.');
        }
      }

      await analyzeContent(
        { text: combinedText.trim() || undefined, files },
        (chunk) => setResult((prev) => prev + chunk),
        (done, total, fileName) =>
          setUploadLabel(total === 0 || done >= total ? null : `Enviando ${done + 1}/${total} · ${fileName}`),
      );
    } catch (err: any) {
      console.error('Erro na análise:', err);
      setError(err.message || 'Ocorreu um erro durante a análise.');
    } finally {
      setIsAnalyzing(false);
      setUploadLabel(null);
    }
  };

  const handleClear = () => {
    setTextInput('');
    setUrlInput('');
    setFiles([]);
    setResult('');
    setError(null);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('Não foi possível copiar o relatório.');
    }
  };

  const canSubmit = !isAnalyzing && Boolean(textInput || urlInput || files.length > 0);

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-48 left-1/2 h-[440px] w-[860px] -translate-x-1/2 rounded-full bg-indigo-400/25 blur-[130px] dark:bg-indigo-600/25" />
        <div className="absolute -bottom-32 right-[-6rem] h-[340px] w-[520px] rounded-full bg-cyan-300/30 blur-[130px] dark:bg-cyan-500/15" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(255,255,255,0.6),transparent_55%)] dark:bg-[radial-gradient(circle_at_50%_-10%,rgba(99,102,241,0.08),transparent_55%)]" />
      </div>

      <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-white/70 backdrop-blur-xl dark:border-white/5 dark:bg-[#07080b]/70">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-[0_8px_20px_-8px_rgba(79,70,229,0.8)]">
              <Sparkles className="h-[18px] w-[18px] text-white" />
            </div>
            <div className="leading-tight">
              <h1 className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-white">Dialecta AI</h1>
              <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-500">Análise crítica de discurso</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleClear}
              className="rounded-lg px-3 py-2 text-[13px] font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
            >
              Limpar
            </button>
            <button
              onClick={() => setIsDarkMode((prev) => !prev)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200/80 bg-white/60 text-zinc-600 transition hover:bg-white hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white"
              title={isDarkMode ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
              aria-label={isDarkMode ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            >
              {isDarkMode ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1440px] grid-cols-1 gap-4 p-4 sm:p-6 lg:h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-5">
        <section className={cn(cardClass, 'lg:min-h-0')}>
          <div className="flex-1 overflow-y-auto p-5 sm:p-6">
            <div className="mb-6 space-y-1">
              <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-white">Nova análise</h2>
              <p className="text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                Texto, link ou arquivo — o relatório mapeia posicionamento, autoria provável e antítese.
              </p>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="analysis-text" className={labelClass}>
                    <FileText className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                    Texto ou transcrição
                  </label>
                  <span
                    className={cn(
                      'font-mono text-[11px] tabular-nums transition-colors',
                      isTyping ? 'text-indigo-500 dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-600',
                    )}
                  >
                    {isTyping ? 'digitando…' : `${textInput.length.toLocaleString('pt-BR')} / ${MAX_TEXT_CHARS.toLocaleString('pt-BR')}`}
                  </span>
                </div>
                <textarea
                  id="analysis-text"
                  value={textInput}
                  onChange={handleTextChange}
                  placeholder="Cole aqui o discurso, artigo ou transcrição…"
                  className={cn(fieldClass, 'h-40 resize-none leading-relaxed')}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="analysis-url" className={labelClass}>
                  <LinkIcon className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                  URL
                  <span className="font-normal text-zinc-400 dark:text-zinc-600">artigo, YouTube…</span>
                </label>
                <input
                  id="analysis-url"
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://…"
                  className={fieldClass}
                />
              </div>

              <div className="space-y-2">
                <label className={labelClass}>
                  <Upload className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                  Arquivos
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={cn(
                    'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition',
                    isDragging
                      ? 'border-indigo-400 bg-indigo-500/10'
                      : 'border-zinc-300 bg-zinc-50/60 hover:border-indigo-300 hover:bg-indigo-500/5 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-indigo-400/50 dark:hover:bg-indigo-500/5',
                  )}
                >
                  <Upload className={cn('h-5 w-5', isDragging ? 'text-indigo-500' : 'text-zinc-400 dark:text-zinc-500')} />
                  <p className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                    {isDragging ? 'Solte para anexar' : 'Arraste arquivos ou clique aqui'}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-600">
                    PDF, imagem, áudio ou vídeo · até {MAX_FILES} arquivos, {formatBytes(MAX_FILE_BYTES)} cada
                  </p>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  multiple
                  className="hidden"
                  accept=".pdf,image/*,audio/*,video/*"
                />

                {files.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {files.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200/80 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                          <span className="truncate text-[13px] text-zinc-700 dark:text-zinc-300">{file.name}</span>
                          <span className="shrink-0 font-mono text-[11px] text-zinc-400 dark:text-zinc-600">{formatBytes(file.size)}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(index);
                          }}
                          className="rounded-md p-1 text-zinc-400 transition hover:bg-red-500/10 hover:text-red-500 dark:text-zinc-500"
                          aria-label={`Remover ${file.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-3 text-[13px] text-red-600 dark:text-red-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="leading-relaxed">{error}</p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-zinc-200/70 bg-white/60 p-5 sm:p-6 dark:border-white/5 dark:bg-white/[0.015]">
            <button
              onClick={handleAnalyze}
              disabled={!canSubmit}
              className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-500 to-cyan-500 text-sm font-semibold text-white shadow-[0_12px_30px_-14px_rgba(79,70,229,0.9)] transition hover:brightness-110 active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-[18px] w-[18px] animate-spin" />
                  {uploadLabel ?? 'Processando análise…'}
                </>
              ) : (
                <>
                  <Sparkles className="h-[18px] w-[18px]" />
                  Iniciar diagnóstico ideológico
                </>
              )}
            </button>
            <p className="mt-3 text-center text-[11px] text-zinc-400 dark:text-zinc-600">
              Relatório gerado por IA · leitura crítica humana continua necessária
            </p>
          </div>
        </section>

        <section className={cn(cardClass, 'lg:min-h-0 dark:bg-[#0a0b10]/70')}>
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200/70 px-5 py-3.5 sm:px-6 dark:border-white/5">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">Relatório</h2>
            <div className="flex items-center gap-2">
              {result && !isAnalyzing && (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-200/80 bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              )}
              <span
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider',
                  isAnalyzing
                    ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
                    : result
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                      : 'border-zinc-200 bg-zinc-100/70 text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-500',
                )}
              >
                {isAnalyzing && <Loader2 className="h-3 w-3 animate-spin" />}
                {isAnalyzing ? (uploadLabel ? 'Enviando' : 'Processando') : result ? 'Concluído' : 'Aguardando'}
              </span>
            </div>
          </div>

          <div ref={resultScrollRef} className="flex-1 overflow-y-auto p-5 sm:p-6">
            {result ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                <div className="markdown-body">
                  <Markdown>{result}</Markdown>
                  {isAnalyzing && (
                    <span className="ml-0.5 inline-block h-4 w-[3px] translate-y-[2px] animate-pulse rounded-full bg-indigo-400 align-middle" />
                  )}
                </div>
              </motion.div>
            ) : (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-200/80 bg-white/80 shadow-sm dark:border-white/10 dark:bg-white/5">
                  <Search className="h-6 w-6 text-indigo-500 dark:text-indigo-400" />
                </div>
                <h3 className="mb-1.5 text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-white">Nenhuma análise ainda</h3>
                <p className="max-w-sm text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-500">
                  O diagnóstico aparece aqui, em streaming, com espectro político, hipóteses de autoria, contexto histórico e antítese.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                  {[
                    { icon: FileText, label: 'Texto' },
                    { icon: LinkIcon, label: 'URL' },
                    { icon: Upload, label: 'Arquivos' },
                  ].map(({ icon: Icon, label }) => (
                    <span
                      key={label}
                      className="flex items-center gap-1.5 rounded-full border border-zinc-200/80 bg-white/70 px-3 py-1.5 text-[11px] font-medium text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
