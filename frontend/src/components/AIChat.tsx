import React, { useEffect, useRef, useState } from 'react';
import { Bot, Check, Send, Sparkles, Trash2, User, Workflow } from 'lucide-react';
import Modal from './Modal';

interface PendingAction {
  mode?: 'action' | 'plan' | 'workflow_confirm';
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
}

const AIChat: React.FC<AIChatProps> = ({ isOpen, onClose }) => {
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
      title="AI 助手"
      footer={null}
    >
      <div className="flex h-[560px] flex-col">
        <div className="mb-4 rounded-[24px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(11,87,208,0.16),_transparent_42%),linear-gradient(180deg,#f8fbff_0%,#f4f7fb_100%)] p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#d3e3fd] bg-white/80 px-3 py-1 text-xs font-semibold text-[#0b57d0]">
                <Sparkles size={14} />
                Workflow Assistant
              </div>
              <h4 className="mt-3 text-lg font-semibold text-slate-900">自然语言触发程序动作</h4>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                直接下指令，程序会按工作流执行查询、整理、通知和系统操作。
              </p>
            </div>
            <div className="hidden rounded-2xl border border-white/70 bg-white/70 p-3 text-[#0b57d0] shadow-sm md:flex">
              <Workflow size={20} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {suggestions.map(item => (
              <button
                key={item}
                type="button"
                onClick={() => setInput(item)}
                className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-[#0b57d0]/30 hover:bg-white hover:text-[#0b57d0]"
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-y-auto rounded-[24px] border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3 md:p-4 custom-scrollbar"
        >
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex max-w-[90%] gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${msg.role === 'user' ? 'bg-[#0b57d0] text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-700 shadow-sm'}`}>
                  {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className="space-y-3">
                  <div className={`rounded-3xl px-4 py-3 text-sm leading-7 whitespace-pre-wrap shadow-sm ${
                    msg.role === 'user'
                      ? 'rounded-tr-md bg-[#0b57d0] text-white'
                      : 'rounded-tl-md border border-slate-200 bg-white text-slate-800'
                  }`}>
                    {msg.content}
                  </div>
                  {msg.role === 'assistant' && msg.action && (
                    <div className="rounded-3xl border border-[#d3e3fd] bg-[linear-gradient(180deg,#f8fbff_0%,#eef5ff_100%)] p-4 shadow-sm">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#0b57d0]">待确认动作</div>
                      <p className="mb-3 text-sm text-slate-600">已生成可执行工作流，确认后程序会直接继续处理。</p>
                      <button
                        onClick={() => handleExecuteAction(i, msg.action!)}
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-full bg-[#0b57d0] px-4 py-2 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-[#0b57d0]/90 hover:shadow-md disabled:opacity-60"
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
              <div className="flex items-center gap-3 text-slate-400">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 shadow-sm animate-pulse">
                  <Bot size={16} />
                </div>
                <span className="text-xs italic">正在调度程序工作流...</span>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
          <button
            onClick={resetChat}
            className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-400 shadow-sm transition-colors hover:text-red-500"
            title="清空对话"
          >
            <Trash2 size={20} />
          </button>
          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="例如：帮我查询未刮削目录，然后按 TMDB 识别重命名并移动到默认整理根目录"
              className="w-full rounded-[22px] border border-slate-300 bg-white px-4 py-3 pr-12 text-sm shadow-sm outline-none transition focus:border-[#0b57d0]/30 focus:ring-4 focus:ring-[#0b57d0]/10"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-2xl bg-[#0b57d0] p-2.5 text-white shadow-sm transition-all hover:-translate-y-[55%] hover:shadow-md disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default AIChat;
