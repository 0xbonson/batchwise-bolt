import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { TypingDots } from '@/components/TallyMarks';

export type ChatMessage = {
  id: number;
  role: 'customer' | 'agent';
  text: string;
};

type DemoChatProps = {
  messages: ChatMessage[];
  typing: boolean;
  onSend: (text: string) => void;
  disabled?: boolean;
  quickReplies?: string[];
  className?: string;
};

export function DemoChat({ messages, typing, onSend, disabled, quickReplies, className }: DemoChatProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  const submit = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    onSend(text);
    setDraft('');
  };

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-[color:var(--ink)]/20 bg-[color:var(--slip)]',
        className
      )}
      style={{ boxShadow: '0 10px 24px -14px rgba(58,34,23,0.4)' }}
    >
      <div className="flex items-center gap-2 border-b border-dashed border-[color:var(--ink)]/25 bg-[color:var(--flour)] px-4 py-2.5">
        <span className="font-slip text-xs font-medium tracking-wide uppercase opacity-70">
          Customer chat
        </span>
        <span className="font-slip text-[10px] opacity-50">demo</span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn('anim-msg flex', m.role === 'customer' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                m.role === 'customer'
                  ? 'rounded-br-sm bg-[color:var(--crust)] text-white'
                  : 'rounded-bl-sm bg-[color:var(--flour)] text-[color:var(--ink)] border border-[color:var(--ink)]/10'
              )}
            >
              {m.text}
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm border border-[color:var(--ink)]/10 bg-[color:var(--flour)] px-3.5 py-2.5">
              <TypingDots />
            </div>
          </div>
        )}
      </div>

      {quickReplies && quickReplies.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {quickReplies.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => !disabled && onSend(q)}
              disabled={disabled}
              className={cn(
                'min-h-[36px] rounded-full border border-[color:var(--teal)] px-3 font-slip text-xs text-[color:var(--teal)] transition-colors',
                disabled
                  ? 'cursor-not-allowed opacity-40'
                  : 'hover:bg-[color:var(--teal)] hover:text-white'
              )}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-dashed border-[color:var(--ink)]/25 p-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="demo-chat-input" className="sr-only">
            Type a message to the bakery
          </label>
          <input
            id="demo-chat-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask for something to bake..."
            autoComplete="off"
            className="min-h-[48px] min-w-0 flex-1 rounded-lg border border-[color:var(--ink)]/25 bg-white px-3 text-sm placeholder:opacity-50 focus:border-[color:var(--teal)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={disabled || !draft.trim()}
            className={cn(
              'min-h-[48px] rounded-lg bg-[color:var(--ink)] px-4 font-slip text-sm font-medium text-[color:var(--parchment)] transition-transform',
              disabled || !draft.trim()
                ? 'cursor-not-allowed opacity-40'
                : 'hover:scale-[1.02] active:scale-[0.98]'
            )}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
