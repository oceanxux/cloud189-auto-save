import React, { useState, useEffect } from 'react';
import { 
  User, 
  Files, 
  ClipboardList, 
  PlayCircle, 
  LayoutGrid, 
  Rss, 
  Link2, 
  Settings, 
  Monitor,
  Search,
  Bell,
  Menu,
  LogOut,
  MessageSquare,
  Moon,
  Sun,
  RotateCcw,
  ChevronDown,
  Terminal
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Components ---
import FloatingActions from './components/FloatingActions';
import CreateTaskModal from './components/CreateTaskModal';
import LogConsole from './components/LogConsole';
import CloudSaverModal from './components/CloudSaverModal';
import AIChat from './components/AIChat';

// --- Tabs ---
import AccountTab from './components/tabs/AccountTab';
import TaskTab from './components/tabs/TaskTab';
import FileManagerTab from './components/tabs/FileManagerTab';
import AutoSeriesTab from './components/tabs/AutoSeriesTab';
import OrganizerTab from './components/tabs/OrganizerTab';
import SubscriptionTab from './components/tabs/SubscriptionTab';
import StrmConfigTab from './components/tabs/StrmConfigTab';
import MediaTab from './components/tabs/MediaTab';
import SettingsTab from './components/tabs/SettingsTab';

// --- Types ---
type TabType = 'account' | 'fileManager' | 'task' | 'autoSeries' | 'organizer' | 'subscription' | 'strmConfig' | 'media' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('task');
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isCloudSaverOpen, setIsCloudSaverOpen] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [createTaskInitialData, setCreateTaskInitialData] = useState<any>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [taskRefreshKey, setTaskRefreshKey] = useState(0);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' || 
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const handleWindowClick = () => {
      setIsUserMenuOpen(false);
    };
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, []);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  const tabs: { id: TabType, label: string, icon: any }[] = [
    { id: 'account', label: '账号', icon: User },
    { id: 'fileManager', label: '文件', icon: Files },
    { id: 'task', label: '任务', icon: ClipboardList },
    { id: 'autoSeries', label: '自动追剧', icon: PlayCircle },
    { id: 'organizer', label: '整理器', icon: LayoutGrid },
    { id: 'subscription', label: '订阅', icon: Rss },
    { id: 'strmConfig', label: 'STRM', icon: Link2 },
    { id: 'media', label: '媒体', icon: Monitor },
    { id: 'settings', label: '系统', icon: Settings },
  ];

  const activeTabLabel = tabs.find(t => t.id === activeTab)?.label || '控制台';

  const handleOpenCreateTask = (initialData?: any) => {
    setCreateTaskInitialData(initialData || null);
    setIsCreateTaskOpen(true);
  };

  const handleLogout = async () => {
    if (!confirm('确定要退出登录吗？')) return;
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch (e) {
      window.location.href = '/login';
    }
  };

  const handleRestartContainer = async () => {
    if (isRestarting) return;
    if (!confirm('确定要重启整个容器吗？服务会短暂中断。')) return;
    try {
      setIsRestarting(true);
      const response = await fetch('/api/system/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const responseText = await response.text();
      const result = responseText ? JSON.parse(responseText) : { success: response.ok };
      if (!result.success) {
        throw new Error(result.error || '重启失败');
      }
      alert('已发送重启请求，页面将在数秒后断开。');
      setTimeout(() => window.location.reload(), 4000);
    } catch (error: any) {
      alert(`重启失败: ${error.message || '未知错误'}`);
      setIsRestarting(false);
    }
  };

  const handleFloatingAction = (id: string) => {
    switch (id) {
      case 'createTask':
        handleOpenCreateTask();
        break;
      case 'cloudsaver':
        setIsCloudSaverOpen(true);
        break;
      case 'strm':
        setActiveTab('strmConfig');
        break;
      case 'logs':
        setIsLogsOpen(true);
        break;
      case 'chat':
        setIsAIChatOpen(true);
        break;
      default:
        break;
    }
  };

  return (
    <div className="flex h-screen bg-[var(--bg-surface)] overflow-hidden font-sans transition-colors duration-200">
      
      {/* Mobile Navigation Drawer Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-slate-900/40 z-40 md:hidden dark:bg-slate-950/60"
            />
            <motion.nav 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
              className="fixed inset-y-0 left-0 w-72 bg-[var(--bg-surface)] flex flex-col z-50 md:hidden shadow-2xl border-r border-[var(--border-color)]"
            >
              <div className="px-6 py-8">
                <h1 className="text-2xl font-medium text-[var(--text-primary)]">天翼自动转存</h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1">Material Design 3</p>
              </div>
              <div className="flex-1 px-3 space-y-1 overflow-y-auto custom-scrollbar">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-full text-sm font-medium transition-colors ${
                      activeTab === tab.id 
                        ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-text)]' 
                        : 'text-[var(--text-primary)] hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <tab.icon size={22} className={activeTab === tab.id ? 'text-[var(--nav-active-text)]' : 'text-[var(--text-secondary)]'} />
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="p-4 border-t border-[var(--border-color)]">
                <button 
                  onClick={handleLogout}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-full text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                >
                  <LogOut size={22} />
                  退出登录
                </button>
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Navigation Drawer */}
      <nav className="w-72 bg-[var(--bg-surface)] flex flex-col hidden md:flex z-10 border-r border-[var(--border-color)]">
        <div className="px-8 py-8">
          <h1 className="text-2xl font-medium text-[var(--text-primary)]">天翼自动转存</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Material Design 3</p>
        </div>
        <div className="flex-1 px-3 space-y-1 overflow-y-auto pb-6 custom-scrollbar">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === tab.id 
                  ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-text)]' 
                  : 'text-[var(--text-primary)] hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
              }`}
            >
              <tab.icon size={22} className={activeTab === tab.id ? 'text-[var(--nav-active-text)]' : 'text-[var(--text-secondary)]'} />
              {tab.label}
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-[var(--border-color)]">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-4 px-5 py-3.5 rounded-full text-sm font-medium text-[var(--text-secondary)] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <LogOut size={22} />
            退出登录
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-screen relative bg-[var(--bg-main)] rounded-tl-3xl shadow-sm border-l border-t border-[var(--border-color)] transition-colors duration-200">
        
        {/* Top App Bar */}
        <header className="h-16 flex items-center justify-between px-4 md:px-8 bg-[var(--bg-main)]/80 backdrop-blur-md z-10 sticky top-0 rounded-tl-3xl transition-colors duration-200">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-[var(--text-primary)] md:hidden"
            >
              <Menu size={24} />
            </button>
            <h2 className="text-2xl font-normal text-[var(--text-primary)]">{activeTabLabel}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={toggleDarkMode}
              className="p-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-[var(--text-primary)]"
              title={isDarkMode ? "切换到亮色模式" : "切换到深色模式"}
            >
              {isDarkMode ? <Sun size={22} /> : <Moon size={22} />}
            </button>
            <button 
              onClick={() => setIsAIChatOpen(true)}
              className="p-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-[var(--text-primary)]"
              title="AI 助手"
            >
              <MessageSquare size={22} />
            </button>
            <button
              onClick={() => setIsLogsOpen(true)}
              className={`p-2.5 rounded-full transition-colors ${
                isLogsOpen
                  ? 'bg-[#d3e3fd] text-[#0b57d0]'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-[var(--text-primary)]'
              }`}
              title="实时日志"
            >
              <Terminal size={22} />
            </button>
            <div className="relative ml-2" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setIsUserMenuOpen(prev => !prev)}
                className="flex items-center gap-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors p-1"
                title="用户菜单"
              >
                <div className="w-9 h-9 rounded-full bg-[#0b57d0] text-white flex items-center justify-center font-medium text-sm cursor-pointer hover:shadow-md transition-shadow">
                  U
                </div>
                <ChevronDown size={16} className="text-[var(--text-secondary)] hidden sm:block" />
              </button>
              <AnimatePresence>
                {isUserMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    className="absolute right-0 top-14 w-52 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] shadow-xl p-2 z-20"
                  >
                    <button
                      onClick={handleRestartContainer}
                      disabled={isRestarting}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[var(--text-primary)] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RotateCcw size={18} />
                      {isRestarting ? '重启中...' : '重启容器'}
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                    >
                      <LogOut size={18} />
                      退出登录
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-32 custom-scrollbar">
          <div className="max-w-6xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {activeTab === 'account' && <AccountTab />}
                {activeTab === 'task' && (
                  <TaskTab 
                    key={`task-tab-${taskRefreshKey}`} 
                    onCreateTask={(data) => handleOpenCreateTask(data)} 
                  />
                )}
                {activeTab === 'fileManager' && <FileManagerTab />}
                {activeTab === 'autoSeries' && <AutoSeriesTab />}
                {activeTab === 'organizer' && <OrganizerTab />}
                {activeTab === 'subscription' && <SubscriptionTab onTransfer={handleOpenCreateTask} />}
                {activeTab === 'strmConfig' && <StrmConfigTab />}
                {activeTab === 'media' && <MediaTab />}
                {activeTab === 'settings' && <SettingsTab />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <FloatingActions onAction={handleFloatingAction} />
      </main>

      {/* Modals */}
      <CreateTaskModal 
        isOpen={isCreateTaskOpen} 
        onClose={() => {
          setIsCreateTaskOpen(false);
          setCreateTaskInitialData(null);
        }}
        onSuccess={() => {
          setTaskRefreshKey(prev => prev + 1);
          setCreateTaskInitialData(null);
        }}
        initialData={createTaskInitialData}
      />

      <LogConsole 
        isOpen={isLogsOpen} 
        onClose={() => setIsLogsOpen(false)} 
      />

      <CloudSaverModal 
        isOpen={isCloudSaverOpen} 
        onClose={() => setIsCloudSaverOpen(false)} 
        onTransfer={(data) => {
          setIsCloudSaverOpen(false);
          handleOpenCreateTask(data);
        }}
      />

      <AIChat 
        isOpen={isAIChatOpen} 
        onClose={() => setIsAIChatOpen(false)} 
      />
    </div>
  );
}
