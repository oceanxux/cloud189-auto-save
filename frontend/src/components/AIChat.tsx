import React, { useEffect, useRef, useState } from 'react';
import { Bot, Check, Send, Sparkles, Trash2, User, Workflow, Zap } from 'lucide-react';
import Modal from './Modal';
import { ToastType } from './Toast';

interface PendingAction {
  action: string;
  target?: {
    type?: string;
    value?: string;
    mediaType?: 'movie' | 'tv' | 'all';
    countOnly?: boolean;
  };
  actions?: PendingAction[];
  runId?: string;
  key?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  action?: PendingAction;
}

interface AIChatProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast?: (message: string, type: ToastType) => void;
}

const AIChat: React.FC<AIChatProps> = ({ isOpen, onClose, onShowToast }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '天翼云小助手已就绪 👋\n你现在是在工作流模式下和系统对话，我会先理解你的指令，再调动程序去查询、整理、通知或执行任务。'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const suggestions = [
    '帮我查询未刮削目录，然后按 TMDB 识别重命名并移动到默认整理根目录',
    '查看失败任务',
    '执行任务 123'
  ];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const resetChat = () => {
    setLoading(false);
    setMessages(prev => prev.slice(0, 1));
  };

  const appendAssistantError = (message: string) => {
    setMessages(prev => [...prev, { role: 'assistant', content: message }]);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          history: messages.slice(-8).map(item => ({
            role: item.role,
            content: item.content
          }))
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        appendAssistantError('抱歉，我遇到了一点问题: ' + (data.error || '请求失败'));
        return;
      }

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.data?.reply || '已处理。',
          action: data.data?.action || undefined
        }
      ]);
    } catch (error) {
      appendAssistantError('发送失败，请检查网络连接或服务状态。');
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteAction = async (messageIndex: number, action: PendingAction) => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executeAction: true,
          action
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || '执行失败');
      }

      setMessages(prev => {
        const next = [...prev];
        const current = next[messageIndex];
        if (current) {
          next[messageIndex] = {
            ...current,
            action: undefined,
            content: `${current.content}\n\n已确认执行。`
          };
        }
        return [...next, { role: 'assistant', content: data.data?.reply || '已执行完成。' }];
      });
    } catch (error: any) {
      appendAssistantError(`执行失败: ${error.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="AI助手"
      variant="plain"
      hideDefaultFooter
      className="max-w-3xl"
    >
      <div className="flex h-[540px] min-h-0 flex-col">
        <div className="mb-4 rounded-[26px] border border-[var(--border-color)] bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.08),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(248,250,252,0.92)_100%)] p-4 shadow-sm dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(148,163,184,0.08),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(15,23,42,0.88)_100%)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/70 bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 dark:text-blue-300">
                <Sparkles size={14} />
                AI Assistant
              </div>
              <h4 className="mt-3 text-2xl font-black tracking-tight text-[var(--text-primary)]">自然语言触发程序动作</h4>
              <p className="mt-1.5 max-w-xl text-[11px] leading-5 text-[var(--text-secondary)] opacity-90">
                直接下指令，程序会按工作流执行查询、整理、通知和系统操作。
              </p>
            </div>
            <div className="hidden md:flex md:items-center md:gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-main)]/88 text-blue-600 shadow-sm dark:text-blue-300">
                <Workflow size={22} />
              </div>
              <div className="rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-main)]/72 px-3 py-2.5 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">模式</div>
                <div className="mt-1 flex items-center gap-2 text-xs font-black text-[var(--text-primary)]">
                  <Zap size={14} className="text-amber-500" />
                  工作流直连
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {suggestions.map(item => (
              <button
                key={item}
                type="button"
                onClick={() => setInput(item)}
                className="rounded-full border border-[var(--border-color)] bg-[var(--bg-main)]/86 px-3 py-1.5 text-[11px] font-black text-[var(--text-primary)] shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:text-blue-600 hover:shadow-md"
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-[26px] border border-[var(--border-color)] bg-[linear-gradient(180deg,rgba(248,250,252,0.75)_0%,rgba(255,255,255,0.96)_100%)] p-3.5 md:p-4 shadow-inner custom-scrollbar dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.72)_0%,rgba(2,6,23,0.92)_100%)]"
        >
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex max-w-[92%] gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${msg.role === 'user' ? 'bg-[var(--app-accent)] text-[var(--bg-main)] shadow-sm' : 'border border-[var(--border-color)] bg-[var(--bg-main)] text-blue-600 shadow-sm dark:text-blue-300'}`}>
                  {msg.role === 'user' ? <User size={15} /> : <Bot size={15} />}
                </div>
                <div className="space-y-3">
                  <div className={`rounded-[22px] px-3.5 py-3 text-[13px] leading-6 whitespace-pre-wrap shadow-sm ${
                    msg.role === 'user'
                      ? 'rounded-tr-md bg-[var(--app-accent)] text-[var(--bg-main)]'
                      : 'rounded-tl-md border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-primary)]'
                  }`}>
                    {msg.content}
                  </div>
                  {msg.role === 'assistant' && msg.action && (
                    <div className="rounded-[22px] border border-blue-200/80 bg-[linear-gradient(180deg,rgba(248,251,255,1)_0%,rgba(238,245,255,1)_100%)] p-3.5 shadow-sm dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.94)_0%,rgba(15,23,42,0.88)_100%)]">
                      <div className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">待确认动作</div>
                      <p className="mb-3 text-sm text-[var(--text-secondary)]">已生成可执行工作流，确认后程序会直接继续处理。</p>
                      <button
                        onClick={() => handleExecuteAction(i, msg.action!)}
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-full bg-[var(--app-accent)] px-4 py-2 text-sm font-black text-[var(--bg-main)] transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60"
                      >
                        <Check size={16} />
                        确认执行
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-3 text-[var(--text-secondary)]">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] text-blue-600 shadow-sm animate-pulse dark:text-blue-300">
                  <Bot size={16} />
                </div>
                <span className="text-xs italic">正在调度程序工作流...</span>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2.5 border-t border-[var(--border-color)] pt-4">
          <button
            onClick={resetChat}
            className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-secondary)] shadow-sm transition-all hover:-translate-y-0.5 hover:text-red-500 hover:shadow-md"
            title="清空对话"
          >
            <Trash2 size={18} />
          </button>
          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="例如：帮我查询未刮削目录，然后按 TMDB 识别重命名并移动到默认整理根目录"
              className="w-full rounded-[20px] border border-[var(--border-color)] bg-[var(--bg-main)] px-4 py-3 pr-12 text-[13px] text-[var(--text-primary)] shadow-sm outline-none transition focus:border-blue-400/50 focus:ring-4 focus:ring-blue-500/10"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-[14px] bg-blue-500 text-white shadow-sm transition-all hover:-translate-y-[55%] hover:bg-blue-600 hover:shadow-md disabled:opacity-50"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default AIChat;
