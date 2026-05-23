import { useEffect, useRef, useState } from 'react';
import { askAssistant } from '../../api/api';
import type { AssistantChatResponse } from '../../types';

const MAX_LENGTH = 2000;

const SUGGESTIONS = [
  'Bu asset için en kritik riskler neler?',
  'Önce hangi bulguları düzeltmeliyim?',
  'DNS tarafındaki sorunları açıkla.',
  'Bu asset production için güvenli mi?',
  'Bana kısa bir aksiyon planı çıkar.',
  'Son tarama sonuçlarını özetle.',
];

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  usedContext?: AssistantChatResponse['usedContext'];
  model?: string;
  isError?: boolean;
}

function ContextBadge({ ctx, model }: { ctx: AssistantChatResponse['usedContext']; model: string }) {
  const parts: string[] = [];
  if (ctx.findings > 0) parts.push(`${ctx.findings} bulgu`);
  if (ctx.scanRuns > 0) parts.push(`${ctx.scanRuns} tarama`);
  if (ctx.intelligence) parts.push('intelligence');

  const modelLabel = model !== 'none' ? model : null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {parts.length > 0 && (
        <span
          className="text-[10px] px-2 py-0.5 rounded-full"
          style={{
            color: 'rgba(56,189,248,0.5)',
            background: 'rgba(56,189,248,0.05)',
            border: '1px solid rgba(56,189,248,0.1)',
          }}
        >
          Bağlam: {parts.join(', ')}
        </span>
      )}
      {modelLabel && (
        <span className="text-[10px] font-mono" style={{ color: 'rgba(56,189,248,0.35)' }}>{modelLabel}</span>
      )}
    </div>
  );
}

function SendIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1-.23 2.188-1.9 2.188H4.698c-1.67 0-2.9-1.188-1.9-2.188L4.2 15.3" />
    </svg>
  );
}

interface AssistantChatProps {
  assetId: string;
}

export function AssistantChat({ assetId }: AssistantChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    setLoading(true);

    try {
      const res = await askAssistant(assetId, trimmed);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.answer,
        usedContext: res.usedContext,
        model: res.model,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Asistan şu anda yanıt veremiyor. Lütfen daha sonra tekrar deneyin.',
        isError: true,
      }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  const showSuggestions = messages.length === 0 && !loading;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#3b82f6,#7c3aed)' }}>
          <BotIcon />
        </div>
        <div>
          <h2 className="text-sm font-bold" style={{ color: '#e2e8f0' }}>Attack Surface Monitor Asistanı</h2>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(148,163,184,0.6)' }}>
            Bu asistan yalnızca bu asset'in tarama, bulgu ve intelligence verilerine göre yanıt verir.
          </p>
        </div>
      </div>

      {/* Chat area */}
      <div
        className="rounded-2xl flex flex-col overflow-hidden"
        style={{
          minHeight: 420,
          background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
          border: '1px solid rgba(56,189,248,0.08)',
        }}
      >
        {/* Message list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ maxHeight: 520 }}>
          {showSuggestions && (
            <div className="space-y-3">
              <p className="text-xs font-medium" style={{ color: 'rgba(148,163,184,0.5)' }}>Örnek sorular:</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void sendMessage(s)}
                    className="text-xs px-3 py-1.5 rounded-full transition-all duration-150 text-left"
                    style={{
                      background: 'rgba(56,189,248,0.05)',
                      border: '1px solid rgba(56,189,248,0.12)',
                      color: 'rgba(56,189,248,0.7)',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgba(56,189,248,0.1)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgba(56,189,248,0.05)';
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: 'linear-gradient(135deg,#3b82f6,#7c3aed)' }}>
                  <BotIcon />
                </div>
              )}

              <div className={`max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
                  style={msg.role === 'user'
                    ? { background: 'linear-gradient(135deg,#3b82f6,#7c3aed)', color: '#fff' }
                    : msg.isError
                    ? { background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }
                    : { background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.1)', color: '#e2e8f0' }
                  }
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                </div>

                {msg.role === 'assistant' && !msg.isError && msg.usedContext && (
                  <ContextBadge ctx={msg.usedContext} model={msg.model ?? ''} />
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: 'linear-gradient(135deg,#3b82f6,#7c3aed)' }}>
                <BotIcon />
              </div>
              <div
                className="rounded-2xl rounded-tl-sm px-4 py-3"
                style={{ background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.1)' }}
              >
                <div className="flex items-center gap-2 text-sm" style={{ color: 'rgba(148,163,184,0.6)' }}>
                  <span className="flex gap-1">
                    {[0, 1, 2].map(n => (
                      <span
                        key={n}
                        className="w-1.5 h-1.5 rounded-full animate-bounce"
                        style={{ background: 'rgba(56,189,248,0.5)', animationDelay: `${n * 150}ms` }}
                      />
                    ))}
                  </span>
                  <span className="text-xs">Asistan yanıt yazıyor...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="p-4" style={{ borderTop: '1px solid rgba(56,189,248,0.08)' }}>
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value.slice(0, MAX_LENGTH))}
                onKeyDown={handleKeyDown}
                disabled={loading}
                placeholder="Bu asset hakkında bir soru sor… (Enter ile gönder, Shift+Enter satır sonu)"
                rows={2}
                className="w-full resize-none rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors disabled:opacity-50"
                style={{
                  background: 'rgba(2,6,23,0.6)',
                  border: '1px solid rgba(56,189,248,0.1)',
                  color: '#e2e8f0',
                }}
                onFocus={e => { (e.target as HTMLElement).style.borderColor = 'rgba(56,189,248,0.3)'; }}
                onBlur={e => { (e.target as HTMLElement).style.borderColor = 'rgba(56,189,248,0.1)'; }}
              />
              {input.length > MAX_LENGTH * 0.8 && (
                <span className="absolute bottom-2 right-3 text-[10px]" style={{ color: 'rgba(56,189,248,0.4)' }}>
                  {input.length}/{MAX_LENGTH}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => void sendMessage(input)}
              disabled={loading || !input.trim()}
              className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed text-white"
              style={{ background: 'linear-gradient(135deg,#3b82f6,#7c3aed)' }}
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
