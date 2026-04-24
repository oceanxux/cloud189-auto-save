import React, { useState, useEffect } from 'react';
import { Search, Flame, Star, PlayCircle, Plus, Loader2, Film, Tv, Info, AlertCircle, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ToastType } from '../Toast';

interface TMDBItem {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string;
  vote_average: number;
  overview: string;
  media_type?: string;
}

interface Props {
  onShowToast?: (message: string, type: ToastType) => void;
}

const TMDBTab: React.FC<Props> = ({ onShowToast }) => {
  const [trending, setTrending] = useState<TMDBItem[]>([]);
  const [popular, setPopular] = useState<TMDBItem[]>([]);
  const [searchResults, setSearchResults] = useState<TMDBItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSearched, setIsSearched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<'movie' | 'tv'>('movie');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  useEffect(() => {
    if (!isSearched) fetchInitialData();
  }, [activeCategory, isSearched]);

  const fetchInitialData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [trendingRes, popularRes] = await Promise.all([
        fetch(`/api/tmdb/trending?type=${activeCategory}&window=week`),
        fetch(`/api/tmdb/popular?type=${activeCategory}`)
      ]);
      const trendingData = await trendingRes.json();
      const popularData = await popularRes.json();
      if (trendingData.success) setTrending(trendingData.data);
      if (popularData.success) setPopular(popularData.data.results);
    } catch (e: any) {
      console.error('Failed to fetch TMDB data', e);
      setErrorMsg('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setIsSearched(false);
      return;
    }
    setIsSearching(true);
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/tmdb/search?keyword=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.data || []);
        setIsSearched(true);
      }
    } catch (e: any) {
      onShowToast?.('搜索失败', 'error');
    } finally {
      setIsSearching(false);
      setLoading(false);
    }
  };

  const handleAutoFollow = async (item: TMDBItem) => {
    const title = item.title || item.name;
    const year = (item.release_date || item.first_air_date || '').split('-')[0];
    
    setProcessingId(item.id);
    try {
      const settingsRes = await fetch('/api/settings');
      const settingsData = await settingsRes.json();
      const mode = settingsData.data?.task?.autoCreate?.mode || 'lazy';

      const res = await fetch('/api/auto-series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          year,
          mode,
          searchType: 'all',
          enable: true
        })
      });
      const data = await res.json();
      if (data.success) {
        onShowToast?.(`已开启追剧: ${title}`, 'success');
      } else {
        onShowToast?.(`失败: ${data.error || '未知错误'}`, 'error');
      }
    } catch (e) {
      onShowToast?.('操作请求失败', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const renderItem = (item: TMDBItem) => {
    const title = item.title || item.name;
    const date = item.release_date || item.first_air_date || '';
    const year = date.split('-')[0];
    const posterUrl = item.poster_path 
      ? `https://image.tmdb.org/t/p/w300${item.poster_path}`
      : 'https://via.placeholder.com/300x450?text=No+Poster';

    return (
      <motion.div 
        key={`${item.media_type}-${item.id}`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="group relative flex flex-col bg-[var(--bg-main)] rounded-2xl overflow-hidden border border-[var(--border-color)] transition-all hover:shadow-xl hover:border-[var(--app-accent)]"
      >
        <div className="aspect-[2/3] relative overflow-hidden">
          <img src={posterUrl} alt={title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
            <p className="text-[10px] text-slate-300 line-clamp-3 mb-3">{item.overview}</p>
            <button 
              onClick={() => handleAutoFollow(item)}
              disabled={processingId === item.id}
              className="w-full py-2 bg-[var(--app-accent)] text-[var(--bg-main)] rounded-xl text-[10px] font-black flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50"
            >
              {processingId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} strokeWidth={3} />}
              自动追剧
            </button>
          </div>
          <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg flex items-center gap-1">
            <Star size={10} className="text-yellow-400 fill-yellow-400" />
            <span className="text-[10px] font-black text-white">{(item.vote_average || 0).toFixed(1)}</span>
          </div>
        </div>
        <div className="p-3">
          <h3 className="text-xs font-black text-[var(--text-primary)] truncate">{title}</h3>
          <p className="text-[10px] font-bold text-slate-400 mt-1">{year || '未知年份'} • {(item.media_type === 'movie' || activeCategory === 'movie') ? '电影' : '剧集'}</p>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="workbench-page pb-20">
      <section className="workbench-hero">
        <div className="workbench-hero-header">
          <div className="workbench-hero-copy">
            <p className="workbench-kicker mb-2">资源广场</p>
            <h1 className="text-[var(--text-primary)]">TMDB 影视资源</h1>
            <p>浏览热门影视作品，一键开启自动追剧，系统将自动监控全网更新。</p>
          </div>
          <div className="flex bg-[var(--bg-sidebar)] p-1 rounded-2xl border border-[var(--border-color)] self-center">
            <button onClick={() => setActiveCategory('movie')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${activeCategory === 'movie' ? 'bg-[var(--app-accent)] text-[var(--bg-main)] shadow-sm' : 'text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)]'}`}><Film size={14} /> 电影</button>
            <button onClick={() => setActiveCategory('tv')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${activeCategory === 'tv' ? 'bg-[var(--app-accent)] text-[var(--bg-main)] shadow-sm' : 'text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)]'}`}><Tv size={14} /> 剧集</button>
          </div>
        </div>
        <div className="mt-6 max-w-xl">
          <form onSubmit={handleSearch} className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[var(--app-accent)]" size={18} />
            <input type="text" placeholder="搜索影视作品标题..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full h-12 pl-12 pr-4 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/20 focus:border-[var(--app-accent)] transition-all" />
            {isSearching && <div className="absolute right-4 top-1/2 -translate-y-1/2"><Loader2 size={18} className="animate-spin text-[var(--app-accent)]" /></div>}
          </form>
        </div>
      </section>

      {loading && !isSearching ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 size={40} className="animate-spin text-[var(--app-accent)]" />
          <p className="text-sm font-bold text-slate-400">正在同步 TMDB 热门数据...</p>
        </div>
      ) : errorMsg ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 rounded-3xl bg-rose-500/10 flex items-center justify-center text-rose-500"><AlertCircle size={32} /></div>
          <p className="text-sm font-bold text-rose-500">{errorMsg}</p>
          <button onClick={fetchInitialData} className="px-6 py-2 bg-[var(--bg-sidebar)] border border-[var(--border-color)] rounded-xl text-xs font-black hover:bg-[var(--nav-hover-bg)] transition-all">重试加载</button>
        </div>
      ) : (
        <div className="space-y-10">
          {isSearched ? (
            <section>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[var(--app-accent)]/10 flex items-center justify-center text-[var(--app-accent)]"><Search size={18} /></div>
                  <h2 className="text-base font-black text-[var(--text-primary)]">搜索结果: {searchQuery}</h2>
                </div>
                <button onClick={() => { setIsSearched(false); setSearchQuery(''); }} className="text-xs font-bold text-blue-500 hover:underline">返回流行</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">{searchResults.length > 0 ? searchResults.map(renderItem) : <div className="col-span-full py-20 text-center text-slate-400 font-bold italic">未找到相关影视资源</div>}</div>
            </section>
          ) : (
            <>
              <section>
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500"><Flame size={18} /></div>
                  <h2 className="text-base font-black text-[var(--text-primary)]">本周流行</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">{trending.slice(0, 12).map(renderItem)}</div>
              </section>
              <section>
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500"><Star size={18} /></div>
                  <h2 className="text-base font-black text-[var(--text-primary)]">最受关注</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">{popular.slice(0, 18).map(renderItem)}</div>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default TMDBTab;
