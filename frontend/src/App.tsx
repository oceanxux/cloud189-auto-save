// BUILD_VERSION: 1777002000000
import React, { useState, useEffect, useRef } from 'react';
import { 
  User, Files, ClipboardList, PlayCircle, LayoutGrid, Rss, Link2, Settings, Monitor, Search, Bell, Menu, LogOut, MessageSquare, Moon, Sun, RotateCcw, ChevronDown, Terminal, Sparkles, X, Clapperboard, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- 组件导入 ---
import FloatingActions from './components/FloatingActions';
import CreateTaskModal from './components/CreateTaskModal';
import LogConsole from './components/LogConsole';
import CloudSaverModal from './components/CloudSaverModal';
import AIChat from './components/AIChat';
import FolderSelector, { SelectedFolder } from './components/FolderSelector';

// --- 标签页导入 ---
import AccountTab from './components/tabs/AccountTab';
import TaskTab from './components/tabs/TaskTab';
import FileManagerTab from './components/tabs/FileManagerTab';
import AutoSeriesTab from './components/tabs/AutoSeriesTab';
import OrganizerTab from './components/tabs/OrganizerTab';
import SubscriptionTab from './components/tabs/SubscriptionTab';
import StrmConfigTab from './components/tabs/StrmConfigTab';
import MediaTab from './components/tabs/MediaTab';
import TMDBTab from './components/tabs/TMDBTab';
import CasTab from './components/tabs/CasTab';
import SettingsTab from './components/tabs/SettingsTab';
import Toast, { ToastType } from './components/Toast';
import ConfirmDialog from './components/ConfirmDialog';
import PromptDialog from './components/PromptDialog';
import { useClickOutside } from './utils/useClickOutside';

function App() {
  const [activeTab, setActiveTab] = useState('task');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Toast 状态
  const [toast, setToast] = useState<{ isVisible: boolean; message: string; type: ToastType }>({
    isVisible: false,
    message: '',
    type: 'info'
  });

  // 确认弹窗状态
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    onConfirm: () => {}
  });

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ isVisible: true, message, type });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void, type: 'danger' | 'warning' | 'info' = 'info') => {
    setConfirmDialog({ isOpen: true, title, message, onConfirm, type });
  };

  // Prompt 状态
  const [promptDialog, setPromptDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    initialValue: string;
    onConfirm: (value: string) => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    initialValue: '',
    onConfirm: () => {}
  });

  const showPrompt = (title: string, message: string, onConfirm: (value: string) => void, initialValue: string = '') => {
    setPromptDialog({ isOpen: true, title, message, onConfirm, initialValue });
  };

  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isCloudSaverOpen, setIsCloudSaverOpen] = useState(false);
  const [createTaskData, setCreateTaskData] = useState<any>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [taskRefreshKey, setTaskRefreshKey] = useState(0);
  const [isRestarting, setIsRestarting] = useState(false);

  // 目录选择器
  const [isFolderSelectorOpen, setIsFolderSelectorOpen] = useState(false);
  const [folderSelectorMode, setFolderSelectorMode] = useState<'target' | 'organizer' | 'manual_strm'>('target');

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  useClickOutside(userMenuRef, () => setIsUserMenuOpen(false), isUserMenuOpen);

  const tabs = [
    { id: 'tmdb', label: 'TMDB资源', icon: Clapperboard },
    { id: 'account', label: '账户中心', icon: User },
    { id: 'fileManager', label: '文件管理', icon: Files },
    { id: 'task', label: '任务中心', icon: ClipboardList },
    { id: 'autoSeries', label: '智能追剧', icon: PlayCircle },
    { id: 'cas', label: '妙传中心', icon: Zap },
    { id: 'organizer', label: '整理任务', icon: LayoutGrid },
    { id: 'subscription', label: '资源订阅', icon: Rss },
    { id: 'strmConfig', label: 'STRM 配置', icon: Link2 },
    { id: 'media', label: '媒体链路', icon: Monitor },
    { id: 'settings', label: '系统设置', icon: Settings },
  ];

  const activeTabLabel = tabs.find(t => t.id === activeTab)?.label || '';
  const tabDescriptions: Record<string, string> = {
    account: '管理账号授权与存储详情',
    task: '实时监控转存与刮削状态',
    fileManager: '云盘浏览、移动与重命名',
    autoSeries: '资源自动搜索与任务创建',
    tmdb: 'TMDB 热门影视与追剧入口',
    cas: '生成 .cas、共享与秒传恢复',
    organizer: '媒体库自动归档任务管理',
    subscription: '追更资源订阅与更新检查',
    strmConfig: 'STRM 生成模版与挂载规则',
    media: 'AI 重命名、TMDB 与 Alist 链路',
    settings: '系统认证、代理与通知设置'
  };

  const handleLogout = () => {
    showConfirm('退出登录', '确定要退出当前工作台并返回登录页面吗？', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } finally {
        window.location.href = '/login.html';
      }
    });
  };

  const handleRestart = async () => {
    if (isRestarting) return;
    showConfirm('重启服务', '确定要重启当前后端服务吗？服务会短暂断开连接并在数秒后恢复。', async () => {
      setIsRestarting(true);
      try {
        const response = await fetch('/api/system/restart', { method: 'POST' });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.message || data.error || '重启失败');
        }
        showToast('重启请求已发送，当前登录会话已清除，服务恢复后请重新登录。', 'info');
        setIsUserMenuOpen(false);
        window.setTimeout(() => {
          window.location.href = '/login';
        }, 1800);
      } catch (error: any) {
        showToast(error?.message || '重启失败', 'error');
      } finally {
        setIsRestarting(false);
      }
    }, 'warning');
  };

  const handleFloatingAction = (action: string) => {
    if (action === 'createTask') setIsCreateTaskOpen(true);
    else if (action === 'cloudsaver') setIsCloudSaverOpen(true);
    else if (action === 'chat') setIsAIChatOpen(true);
    else if (action === 'strm') {
       setFolderSelectorMode('manual_strm');
       setIsFolderSelectorOpen(true);
    }
  };

  const handleManualStrm = async (folder: SelectedFolder) => {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `帮我整理目录 ${folder.name}`, executeAction: true })
      });
      if ((await response.json()).success) {
        setActiveTab('task');
        showToast(`已开始整理目录: ${folder.name}`, 'success');
      }
    } catch (e) { showToast('操作失败', 'error'); }
  };

  return (
    <div className={`flex h-screen w-full transition-colors duration-300 ${isDarkMode ? 'dark' : ''} overflow-hidden`}>
      
      {/* 移动端菜单 */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-[2000] md:hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMobileMenuOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
            <motion.nav initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="absolute inset-y-0 left-0 w-64 bg-[var(--bg-sidebar)] p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2.5"><Sparkles size={20} className="text-[var(--app-accent)]" /><h1 className="text-xl font-black text-[var(--text-primary)]">工作台</h1></div>
                <button onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>
              </div>
              <div className="space-y-1.5 overflow-y-auto custom-scrollbar">
                {tabs.map(tab => (
                  <button key={tab.id} onClick={() => { setActiveTab(tab.id); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-[var(--app-accent)] text-[var(--bg-main)] shadow-sm' : 'text-[var(--text-secondary)]'}`}>
                    <tab.icon size={20} />{tab.label}
                  </button>
                ))}
              </div>
            </motion.nav>
          </div>
        )}
      </AnimatePresence>

      {/* 桌面端侧边栏 */}
      <nav className="hidden w-48 flex-col border-r border-[var(--border-color)] bg-[var(--bg-sidebar)] md:flex z-20">
        <div className="px-5 py-8 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[var(--app-accent)] flex items-center justify-center shadow-lg"><Sparkles size={16} className="text-[var(--bg-main)]" /></div>
          <h1 className="text-base font-black tracking-tight truncate text-[var(--text-primary)]">工作台</h1>
        </div>
        <div className="flex-1 px-2.5 space-y-1 overflow-y-auto pb-6 custom-scrollbar">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => { setIsUserMenuOpen(false); setActiveTab(tab.id); }} className={`w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all ${activeTab === tab.id ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-text)] shadow-sm ring-1 ring-slate-200/50 dark:ring-slate-700/50' : 'text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)]'}`}>
              <tab.icon size={16} strokeWidth={activeTab === tab.id ? 3 : 2.5} />{tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* 主体内容 */}
      <main className="relative flex flex-1 flex-col overflow-hidden bg-[var(--bg-surface)] z-0">
        <header className="sticky top-0 z-30 flex min-h-[56px] items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-main)]/80 px-5 backdrop-blur-xl transition-colors duration-200">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsMobileMenuOpen(true)} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-[var(--text-primary)] md:hidden"><Menu size={20} /></button>
            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-black text-[var(--text-primary)]">{activeTabLabel}</h2>
              <span className="hidden text-[10px] font-bold text-slate-400 md:block opacity-60">/ {tabDescriptions[activeTab]}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-xl hover:bg-[var(--nav-hover-bg)] text-[var(--text-primary)]">{isDarkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button onClick={() => setIsAIChatOpen(true)} className="p-2 rounded-xl hover:bg-[var(--nav-hover-bg)] text-[var(--text-primary)]"><MessageSquare size={18} /></button>
            <button onClick={() => setIsLogsOpen(true)} className={`p-2 rounded-xl transition-all ${isLogsOpen ? 'bg-blue-100 text-blue-600' : 'hover:bg-[var(--nav-hover-bg)] text-[var(--text-primary)]'}`}><Terminal size={18} /></button>
            <div className="w-px h-4 bg-[var(--border-color)] mx-1" />
            <div ref={userMenuRef} className="relative">
              <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--app-accent)] text-[10px] font-black text-[var(--bg-main)] shadow-sm">U</button>
              <AnimatePresence>
                {isUserMenuOpen && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="absolute right-0 top-11 z-[500] w-48 rounded-2xl border border-[var(--border-color)] bg-[var(--modal-bg)] p-1.5 shadow-2xl backdrop-blur-2xl" onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setIsUserMenuOpen(false); handleRestart(); }} disabled={isRestarting} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-black text-amber-600 hover:bg-amber-50 disabled:opacity-60">
                      <RotateCcw size={16} className={isRestarting ? 'animate-spin' : ''} />
                      {isRestarting ? '重启中' : '重启服务'}
                    </button>
                    <button onClick={() => { setIsUserMenuOpen(false); handleLogout(); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-black text-red-500 hover:bg-red-50"><LogOut size={16} />退出登录</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-20 pt-4 md:px-6 custom-scrollbar z-0">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }} transition={{ duration: 0.3 }}>
              {activeTab === 'account' && <AccountTab onShowToast={showToast} onShowConfirm={showConfirm} onShowPrompt={showPrompt} />}
              {activeTab === 'fileManager' && <FileManagerTab onShowToast={showToast} onShowConfirm={showConfirm} />}
              {activeTab === 'task' && <TaskTab key={`task-${taskRefreshKey}`} onCreateTask={(data) => { setCreateTaskData(data); setIsCreateTaskOpen(true); }} onShowToast={showToast} onShowConfirm={showConfirm} />}
              {activeTab === 'autoSeries' && <AutoSeriesTab onShowToast={showToast} onShowConfirm={showConfirm} />}
              {activeTab === 'tmdb' && <TMDBTab onShowToast={showToast} />}
              {activeTab === 'cas' && <CasTab onShowToast={showToast} onShowConfirm={showConfirm} />}
              {activeTab === 'organizer' && <OrganizerTab onShowToast={showToast} onShowConfirm={showConfirm} />}
              {activeTab === 'subscription' && <SubscriptionTab onTransfer={() => setIsCreateTaskOpen(true)} onShowToast={showToast} onShowConfirm={showConfirm} />}
              {activeTab === 'strmConfig' && <StrmConfigTab onShowToast={showToast} onShowConfirm={showConfirm} />}
              {activeTab === 'media' && <MediaTab onShowToast={showToast} />}
              {activeTab === 'settings' && <SettingsTab onShowToast={showToast} />}
            </motion.div>
          </AnimatePresence>
        </div>
        <FloatingActions onAction={handleFloatingAction} />
      </main>

      {/* 全局浮层 */}
      <Toast 
        isVisible={toast.isVisible} 
        message={toast.message} 
        type={toast.type} 
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))} 
      />
      <CreateTaskModal 
        isOpen={isCreateTaskOpen} 
        onClose={() => setIsCreateTaskOpen(false)} 
        initialData={createTaskData} 
        onSuccess={() => { setIsCreateTaskOpen(false); setTaskRefreshKey(v => v + 1); }} 
        onShowToast={showToast}
      />
      <LogConsole isOpen={isLogsOpen} onClose={() => setIsLogsOpen(false)} />
      <CloudSaverModal isOpen={isCloudSaverOpen} onClose={() => setIsCloudSaverOpen(false)} onTransfer={(d) => { setIsCloudSaverOpen(false); setCreateTaskData(d); setIsCreateTaskOpen(true); }} />
      <AIChat 
        isOpen={isAIChatOpen} 
        onClose={() => setIsAIChatOpen(false)} 
        onShowToast={showToast}
      />
      <FolderSelector isOpen={isFolderSelectorOpen} onClose={() => setIsFolderSelectorOpen(false)} accountId={0} title={folderSelectorMode === 'manual_strm' ? "选择要整理并生成 STRM 的目录" : "选择存入目录"} onSelect={(f: SelectedFolder) => { if (folderSelectorMode === 'manual_strm') handleManualStrm(f); setIsFolderSelectorOpen(false); }} />
      <ConfirmDialog 
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        onConfirm={confirmDialog.onConfirm}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
      <PromptDialog 
        isOpen={promptDialog.isOpen}
        title={promptDialog.title}
        message={promptDialog.message}
        initialValue={promptDialog.initialValue}
        onConfirm={promptDialog.onConfirm}
        onClose={() => setPromptDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

export default App;
