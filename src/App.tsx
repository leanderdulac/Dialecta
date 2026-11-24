import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { FileText, Link as LinkIcon, Upload, Loader2, Search, AlertCircle, X, CheckCircle2, Sun, Moon } from 'lucide-react';
import Markdown from 'react-markdown';
import { analyzeContent } from './services/geminiService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [textInput, setTextInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTextInput(e.target.value);
    
    setIsTyping(true);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 1000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          // Remove the data:mime/type;base64, prefix
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        } else {
          reject(new Error('Failed to read file as base64'));
        }
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleAnalyze = async () => {
    if (!textInput && !urlInput && files.length === 0) {
      setError('Por favor, forneça um texto, URL ou arquivo para análise.');
      return;
    }

    setIsAnalyzing(true);
    setResult('');
    setError(null);

    try {
      let combinedText = textInput;
      if (urlInput) {
        combinedText += `\n\nURL para análise: ${urlInput}`;
      }

      const fileData = await Promise.all(
        files.map(async (file) => ({
          mimeType: file.type,
          data: await fileToBase64(file),
        }))
      );

      await analyzeContent(
        {
          text: combinedText.trim() || undefined,
          files: fileData,
        },
        (chunk) => {
          setResult((prev) => prev + chunk);
        }
      );
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Ocorreu um erro durante a análise.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className={cn(
      "min-h-screen font-sans flex flex-col transition-colors duration-200",
      isDarkMode ? "dark bg-[#0a0a0a] text-[#e5e5e5]" : "bg-gray-50 text-gray-900"
    )}>
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-white/10 bg-white dark:bg-[#0f0f0f] px-6 py-4 flex items-center justify-between sticky top-0 z-10 transition-colors duration-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Search className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">IdeoScope AI</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono uppercase tracking-wider">Sistema de Análise Crítica</p>
          </div>
        </div>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 text-gray-600 dark:text-gray-400 transition-colors"
          title={isDarkMode ? "Mudar para tema claro" : "Mudar para tema escuro"}
        >
          {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0">
        {/* Left Panel: Input */}
        <div className="p-6 lg:p-8 border-r border-gray-200 dark:border-white/10 flex flex-col gap-6 overflow-y-auto max-h-[calc(100vh-73px)] bg-white dark:bg-transparent transition-colors duration-200">
          <div className="space-y-1">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">Nova Análise</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Forneça o material para mapeamento ideológico e contextualização histórica.</p>
          </div>

          {/* Text Input */}
          <div className="space-y-2 relative">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Texto ou Transcrição
              </label>
              {isTyping && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500 font-mono">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="ml-1">digitando...</span>
                </div>
              )}
            </div>
            <textarea
              value={textInput}
              onChange={handleTextChange}
              placeholder="Cole o texto, discurso ou artigo aqui..."
              className="w-full h-48 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-white/10 rounded-xl p-4 text-sm text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all resize-none"
            />
          </div>

          {/* URL Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <LinkIcon className="w-4 h-4" />
              URL (Artigo, YouTube, etc.)
            </label>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://..."
              className="w-full bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
            />
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Arquivos (PDF, Imagem, Áudio, Vídeo)
            </label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-300 dark:border-white/10 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-blue-500/50 hover:bg-blue-50 dark:hover:bg-blue-500/5 transition-all"
            >
              <Upload className="w-6 h-6 text-gray-400 dark:text-gray-500" />
              <p className="text-sm text-gray-600 dark:text-gray-400">Clique para selecionar arquivos</p>
              <p className="text-xs text-gray-500 dark:text-gray-600">Suporta PDF, PNG, JPG, MP3, MP4</p>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              className="hidden"
              accept=".pdf,image/*,audio/*,video/*"
            />
            
            {/* File List */}
            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{file.name}</span>
                    </div>
                    <button 
                      onClick={() => removeFile(index)}
                      className="text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 p-1 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl flex items-start gap-3 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || (!textInput && !urlInput && files.length === 0)}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-[#1a1a1a] disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 mt-auto"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processando Análise...
              </>
            ) : (
              'Iniciar Diagnóstico Ideológico'
            )}
          </button>
        </div>

        {/* Right Panel: Output */}
        <div className="bg-gray-50 dark:bg-[#050505] p-6 lg:p-8 overflow-y-auto max-h-[calc(100vh-73px)] relative transition-colors duration-200">
          {result ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-3xl mx-auto"
            >
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-200 dark:border-white/10">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Relatório de Análise</h2>
                {isAnalyzing ? (
                  <div className="px-3 py-1 bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs font-mono rounded-full border border-blue-200 dark:border-blue-500/20 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    PROCESSANDO
                  </div>
                ) : (
                  <div className="px-3 py-1 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-mono rounded-full border border-emerald-200 dark:border-emerald-500/20">
                    CONCLUÍDO
                  </div>
                )}
              </div>
              <div className="markdown-body">
                <Markdown>{result}</Markdown>
              </div>
            </motion.div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto opacity-60 dark:opacity-40">
              <Search className="w-16 h-16 text-gray-400 dark:text-gray-600 mb-6" />
              <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-2">Nenhuma análise ativa</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Preencha os dados no painel lateral e inicie o diagnóstico para visualizar o relatório estruturado aqui.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
