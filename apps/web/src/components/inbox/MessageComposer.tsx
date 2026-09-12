'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, Mic, Smile, Zap, Loader2 } from 'lucide-react';
import { useInboxStore } from '@/store/useInboxStore';

interface MessageComposerProps {
  inputText: string;
  setInputText: (text: string) => void;
}

export default function MessageComposer({ inputText, setInputText }: MessageComposerProps) {
  const { sendMessage, isSending, templates, fetchTemplates } = useInboxStore();
  const [showTemplatesMenu, setShowTemplatesMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    // If starts with / or has / as last word, open templates menu
    if (val.endsWith('/') || val.startsWith('/')) {
      setShowTemplatesMenu(true);
    } else if (!val.includes('/')) {
      setShowTemplatesMenu(false);
    }
  };

  const selectTemplate = (content: string) => {
    setInputText(content);
    setShowTemplatesMenu(false);
    textareaRef.current?.focus();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSending) return;

    const text = inputText;
    setInputText('');
    setShowTemplatesMenu(false);
    await sendMessage(text);
  };

  return (
    <div className="p-4 bg-white border-t border-slate-200 relative">
      {/* Quick Templates Popup menu */}
      {showTemplatesMenu && templates.length > 0 && (
        <div className="absolute bottom-full left-4 mb-2 w-96 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-30 animate-in fade-in slide-in-from-bottom-2">
          <div className="p-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-800">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-emerald-600" />
              <span>Templates Rápidos (Selecione com 1 clique)</span>
            </span>
            <button
              onClick={() => setShowTemplatesMenu(false)}
              className="text-slate-400 hover:text-slate-700 text-[10px]"
            >
              Fechar
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => selectTemplate(tpl.content)}
                className="w-full p-2.5 text-left hover:bg-slate-50 transition-colors flex flex-col gap-0.5"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-slate-900">
                  <span>{tpl.title}</span>
                  <code className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-emerald-700 border border-slate-200">
                    {tpl.shortcut}
                  </code>
                </div>
                <p className="text-[11px] text-slate-500 line-clamp-1">{tpl.content}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Box */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Digite uma mensagem ou digite '/' para templates rápidos (Enter para enviar)..."
            className="w-full h-20 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 resize-none focus:outline-none focus:bg-white focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-slate-500">
            <button
              type="button"
              title="Anexar arquivo"
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-800"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <button
              type="button"
              title="Gravar áudio"
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-800"
            >
              <Mic className="w-4 h-4" />
            </button>
            <button
              type="button"
              title="Inserir Emoji"
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-800"
            >
              <Smile className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowTemplatesMenu(!showTemplatesMenu)}
              className="p-2 hover:bg-emerald-50 rounded-lg transition-colors flex items-center gap-1 text-xs text-emerald-700 font-medium"
            >
              <Zap className="w-4 h-4 text-emerald-600" />
              <span className="hidden sm:inline">Templates (/)</span>
            </button>
          </div>

          <button
            type="submit"
            disabled={!inputText.trim() || isSending}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <span>Enviar</span>
                <Send className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
