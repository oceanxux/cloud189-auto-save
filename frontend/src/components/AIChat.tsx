import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, Trash2, User } from 'lucide-react';
import Modal from './Modal';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AIChatProps {
  isOpen: boolean;
  onClose: () => void;
}

const AIChat: React.FC<AIChatProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '你好！我是天翼自动转存助理。你可以问我关于任务状态、账号容量或者如何配置订阅的问题。' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const isStreamingRef = useRef(false);
  const hasAssistantPlaceholderRef = useRef(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!isOpen) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      isStreamingRef.current = false;
      hasAssistantPlaceholderRef.current = false;
      setLoading(false);
      return;
    }

    const eventSource = new EventSource('/api/logs/events');
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type !== 'aimessage' || !isStreamingRef.current) {
          return;
        }

        const chunk = String(data.message || '');
        if (chunk === '[END]') {
          isStreamingRef.current = false;
          hasAssistantPlaceholderRef.current = false;
          setLoading(false);
          return;
        }

        setMessages(prev => {
          if (!hasAssistantPlaceholderRef.current) {
            hasAssistantPlaceholderRef.current = true;
            return [...prev, { role: 'assistant', content: chunk }];
          }

          const nextMessages = [...prev];
          const lastMessage = nextMessages[nextMessages.length - 1];
          if (lastMessage?.role === 'assistant') {
            nextMessages[nextMessages.length - 1] = {
              ...lastMessage,
              content: `${lastMessage.content}${chunk}`
            };
            return nextMessages;
          }

          return [...nextMessages, { role: 'assistant', content: chunk }];
        });
      } catch (error) {
        console.error('解析 AI SSE 消息失败:', error);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      eventSourceRef.current = null;
      if (isStreamingRef.current) {
        isStreamingRef.current = false;
        hasAssistantPlaceholderRef.current = false;
        setLoading(false);
        setMessages(prev => [...prev, { role: 'assistant', content: 'AI 响应流已中断，请稍后重试。' }]);
      }
    };

    return () => {
      eventSource.close();
      if (eventSourceRef.current === eventSource) {
        eventSourceRef.current = null;
      }
    };
  }, [isOpen]);

  const resetChat = () => {
    isStreamingRef.current = false;
    hasAssistantPlaceholderRef.current = false;
    setLoading(false);
    setMessages(prev => prev.slice(0, 1));
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);
    isStreamingRef.current = true;
    hasAssistantPlaceholderRef.current = false;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        isStreamingRef.current = false;
        hasAssistantPlaceholderRef.current = false;
        setLoading(false);
        setMessages(prev => [...prev, { role: 'assistant', content: '抱歉，我遇到了一点问题: ' + (data.error || '请求失败') }]);
      }
    } catch (error) {
      isStreamingRef.current = false;
      hasAssistantPlaceholderRef.current = false;
      setLoading(false);
      setMessages(prev => [...prev, { role: 'assistant', content: '发送失败，请检查网络连接或 AI 配置。' }]);
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="AI 助手"
      footer={null}
    >
      <div className="flex flex-col h-[500px]">
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-4 p-2 custom-scrollbar"
        >
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-[#0b57d0] text-white' : 'bg-purple-100 text-purple-700'}`}>
                  {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-[#0b57d0] text-white rounded-tr-none' 
                    : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'
                }`}>
                  {msg.content}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="flex gap-3 items-center text-slate-400">
                <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-400 flex items-center justify-center animate-pulse">
                  <Bot size={16} />
                </div>
                <span className="text-xs italic">正在思考...</span>
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
              placeholder="问点什么..."
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
