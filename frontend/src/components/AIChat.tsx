import React, { useEffect, useRef, useState } from 'react';
import { Bot, Check, Send, Trash2, User } from 'lucide-react';
import Modal from './Modal';

interface PendingAction {
  mode?: 'action' | 'plan';
  action: string;
  target?: {
    type?: string;
    value?: string;
    mediaType?: 'movie' | 'tv' | 'all';
    countOnly?: boolean;
  };
  actions?: PendingAction[];
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
      content: '你好，我现在可以直接调用程序动作。你可以试试：执行任务 123、帮我整理任务 123、查看失败任务、查询未刮削目录下还有哪些没归档的电影和电视剧、重启容器。'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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
      <div className="flex flex-col h-[520px]">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-4 p-2 custom-scrollbar"
        >
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-3 max-w-[88%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-[#0b57d0] text-white' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                  {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className="space-y-3">
                  <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[#0b57d0] text-white rounded-tr-none'
                      : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'
                  }`}>
                    {msg.content}
                  </div>
                  {msg.role === 'assistant' && msg.action && (
                    <div className="rounded-2xl border border-[#d3e3fd] bg-[#f7faff] p-3">
                      <div className="text-xs font-medium text-[#0b57d0] mb-2">待确认动作</div>
                      <button
                        onClick={() => handleExecuteAction(i, msg.action!)}
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-full bg-[#0b57d0] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#0b57d0]/90 disabled:opacity-60"
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
              <div className="flex gap-3 items-center text-slate-400">
                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 border border-slate-200 flex items-center justify-center animate-pulse">
                  <Bot size={16} />
                </div>
                <span className="text-xs italic">正在处理...</span>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
          <button
            onClick={resetChat}
            className="p-3 text-slate-400 hover:text-red-500 transition-colors"
            title="清空对话"
          >
            <Trash2 size={20} />
          </button>
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="例如：先查未刮削，再说“帮我整理移动一下”"
              className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-[#0b57d0] text-white rounded-xl disabled:opacity-50 transition-all hover:shadow-md"
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
