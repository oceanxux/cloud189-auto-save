const got = require('got');
const ConfigService = require('./ConfigService');
const ProxyUtil = require('../utils/ProxyUtil');
const { logTaskEvent } = require('../utils/logUtils');
const { parseMediaTitle } = require('../utils/mediaTitleParser');
const { AppDataSource } = require('../database');
const { TmdbCache } = require('../entities');

class TMDBService {
    constructor() {
        this.apiKey = ConfigService.getConfigValue('tmdb.tmdbApiKey') || ConfigService.getConfigValue('tmdb.apiKey');
        this.baseURL = 'https://api.themoviedb.org/3';
        this.language = 'zh-CN';
        this.cacheRepo = AppDataSource.isInitialized ? AppDataSource.getRepository(TmdbCache) : null;
    }

    _getCacheRepo() {
        if (this.cacheRepo) {
            return this.cacheRepo;
        }
        if (AppDataSource.isInitialized) {
            this.cacheRepo = AppDataSource.getRepository(TmdbCache);
            return this.cacheRepo;
        }
        return null;
    }

    async _readCache(cacheKey) {
        const repo = this._getCacheRepo();
        if (!repo) return null;
        const record = await repo.findOneBy({ cacheKey });
        if (!record) return null;
        if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
            await repo.delete({ id: record.id });
            return null;
        }
        try {
            return JSON.parse(record.content);
        } catch {
            return null;
        }
    }

    async _writeCache(cacheKey, category, data, ttlSeconds = 21600) {
        const repo = this._getCacheRepo();
        if (!repo) return;
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
        const existing = await repo.findOneBy({ cacheKey });
        if (existing) {
            existing.category = category;
            existing.content = JSON.stringify(data);
            existing.expiresAt = expiresAt;
            await repo.save(existing);
            return;
        }
        await repo.save(repo.create({
            cacheKey,
            category,
            content: JSON.stringify(data),
            expiresAt
        }));
    }

    async _withCache(cacheKey, category, fetcher, ttlSeconds = 21600) {
        const cached = await this._readCache(cacheKey);
        if (cached != null) {
            logTaskEvent(`TMDB缓存命中: ${cacheKey}`, 'info', 'tmdb');
            return cached;
        }
        logTaskEvent(`TMDB缓存未命中，回源请求: ${cacheKey}`, 'info', 'tmdb');
        const fresh = await fetcher();
        await this._writeCache(cacheKey, category, fresh, ttlSeconds);
        return fresh;
    }

    async getCacheSummary() {
        const repo = this._getCacheRepo();
        if (!repo) {
            return { total: 0, categories: [] };
        }
        const records = await repo.find();
        const categoryMap = new Map();
        for (const record of records) {
            categoryMap.set(record.category, (categoryMap.get(record.category) || 0) + 1);
        }
        return {
            total: records.length,
            categories: Array.from(categoryMap.entries()).map(([category, count]) => ({ category, count }))
        };
    }

    _logSearch(message) {
        const line = String(message || '');
        if (!line) return;
        console.log(line);
        logTaskEvent(line, 'info', 'tmdb');
    }

    _buildSearchParams(type, title, year = '') {
        const params = { query: title };
        if (year) {
            if (type === 'tv') params.first_air_date_year = year;
            else params.year = year;
        }
        return params;
    }

    _buildLayeredSearchPlan(rawTitle, year = '') {
        const GENERIC_TITLES = new Set(['season', 'series', 'part', 'episode', '第季', '第集', '合集', 'extras', 'specials', 'bonus', 'ova', 'sp', 'mv']);
        const parsed = parseMediaTitle(rawTitle);
        const fallbackTitle = String(rawTitle || '').trim();
        let cleanTitle = parsed.cleanTitle || fallbackTitle;
        
        if (GENERIC_TITLES.has(cleanTitle.toLowerCase())) {
            cleanTitle = '';
        }

        const externalYear = String(year || '').trim();
        const parsedYear = parsed.year ? String(parsed.year) : '';
        const resolvedYear = externalYear || parsedYear;
        const aliases = Array.isArray(parsed.aliases) ? parsed.aliases : [];
        const dedupe = new Set();

        const uniqueAliases = aliases.filter(item => {
            const key = String(item || '').trim().toLowerCase();
            if (!key || key === cleanTitle.toLowerCase() || dedupe.has(key)) return false;
            dedupe.add(key);
            return true;
        });

        return {
            parsed,
            cleanTitle,
            resolvedYear,
            rounds: {
                1: cleanTitle && resolvedYear ? [{ title: cleanTitle, year: resolvedYear }] : [],
                2: cleanTitle ? [{ title: cleanTitle, year: '' }] : [],
                3: resolvedYear ? uniqueAliases.map(alias => ({ title: alias, year: resolvedYear })) : [],
                4: uniqueAliases.map(alias => ({ title: alias, year: '' }))
            }
        };
    }

    _logParsedContext(parsed, cleanTitle, resolvedYear) {
        this._logSearch(`原始标题：${parsed.rawName || ''}`);
        this._logSearch(`清洗后标题：${cleanTitle || '空'}`);
        this._logSearch(`提取年份：${resolvedYear || '无'}`);
        if (Array.isArray(parsed.removedTokens) && parsed.removedTokens.length > 0) {
            this._logSearch(`移除Token：${parsed.removedTokens.join(', ')}`);
        }
    }

    async _pickBestMatchDetail(type, results, searchTitle, searchYear, currentEpisodes = 0) {
        const sortedResults = [...results].sort((a, b) => {
            const dateA = type === 'movie' ? a.release_date : a.first_air_date;
            const dateB = type === 'movie' ? b.release_date : b.first_air_date;
            return new Date(dateB || 0) - new Date(dateA || 0);
        });

        const detailPromises = sortedResults.slice(0, 3).map(async media => {
            return type === 'tv' ? await this.getTVDetails(media.id) : await this.getMovieDetails(media.id);
        });

        const details = await Promise.all(detailPromises);
        const validDetails = details.filter(Boolean);
        if (!validDetails.length) return null;

        const bestMatch = validDetails.reduce((best, current) => {
            if (!current) return best;
            let score = 0;
            const currentTitle = String(current.title || '').toLowerCase();
            const targetTitle = String(searchTitle || '').toLowerCase();

            if (currentTitle === targetTitle) score += 10;
            else if (currentTitle.includes(targetTitle) || targetTitle.includes(currentTitle)) score += 5;

            const mediaYear = Number(new Date(current.releaseDate).getFullYear() || 0);
            if (searchYear && mediaYear === Number.parseInt(searchYear, 10)) score += 5;

            if (type === 'tv' && currentEpisodes > 0) {
                const latestEpisode = Number(current?.lastEpisodeToAir?.episode_number || 0);
                if (latestEpisode > 0) {
                    if (current.status === 'Returning Series' && currentEpisodes <= latestEpisode) score += 5;
                    if (current.status === 'Ended' && Math.abs(latestEpisode - currentEpisodes) <= 2) score += 5;
                    if (currentEpisodes > latestEpisode) score -= 3;
                }
            }
            return (!best || score > best.score) ? { ...current, score } : best;
        }, null);

        this._logSearch(`最佳匹配结果: ${bestMatch?.title || '空'}, 分数: ${bestMatch?.score ?? '无'}`);
        return bestMatch?.id ? (type === 'tv' ? await this.getTVDetails(bestMatch.id) : await this.getMovieDetails(bestMatch.id)) : null;
    }

    async _request(endpoint, params = {}) {
        const apiKey = ConfigService.getConfigValue('tmdb.tmdbApiKey') || ConfigService.getConfigValue('tmdb.apiKey');
        if (!apiKey) {
            throw new Error('未配置 TMDB API Key');
        }
        const proxy = ProxyUtil.getProxyAgent('tmdb');
        try {
            return await got(`${this.baseURL}${endpoint}`, {
                searchParams: { api_key: apiKey, language: this.language, ...params },
                agent: proxy
            }).json();
        } catch (error) {
            console.error(`TMDB请求失败 [${endpoint}]:`, error.message);
            throw error;
        }
    }
    
    async search(title, year = '') {
        try {
            const cacheKey = `tmdb:search:${String(title).trim().toLowerCase()}:${String(year || '').trim()}`;
            const { movies, tvShows } = await this._withCache(cacheKey, 'search', async () => {
                const response = await this._request('/search/multi', { query: title, year: year });
                return {
                    movies: response.results.filter(item => item.media_type === 'movie').map(item => ({ 
                        id: item.id, 
                        title: item.title, 
                        release_date: item.release_date, 
                        poster_path: item.poster_path,
                        vote_average: item.vote_average,
                        overview: item.overview,
                        media_type: 'movie' 
                    })),
                    tvShows: response.results.filter(item => item.media_type === 'tv').map(item => ({ 
                        id: item.id, 
                        name: item.name, 
                        first_air_date: item.first_air_date, 
                        poster_path: item.poster_path,
                        vote_average: item.vote_average,
                        overview: item.overview,
                        media_type: 'tv' 
                    }))
                };
            }, 86400);
            console.log(`[TMDB] Search results for "${title}": found ${movies.length} movies, ${tvShows.length} TV shows`);
            return { movies: movies.slice(0, 5), tvShows: tvShows.slice(0, 5) };
        } catch (error) { throw new Error(`TMDB搜索失败: ${error.message}`); }
    }

    async searchMovie(title, year = '') {
        return await this._searchMedia('movie', title, year, 1);
    }

    async searchTV(title, year = '', currentEpisodes = 0) {
        const result = await this._searchMedia('tv', title, year, currentEpisodes);
        if (result) {
            return await this._applySeasonContext(result, title);
        }
        // 如果搜不到 TV 且只有 1 个文件，自动尝试电影模式
        // 注意：这里传原始标题 title，让 searchMovie 内部执行自己的分层搜索计划
        if (!result && currentEpisodes <= 1) {
            this._logSearch(`TV 模式未找到结果，自动切换至电影模式重试...`);
            return await this.searchMovie(title, year);
        }
        return result;
    }

    async _searchMedia(type, title, year, currentEpisodes = 0) {
        const plan = this._buildLayeredSearchPlan(title, year);
        this._logParsedContext(plan.parsed, plan.cleanTitle, plan.resolvedYear);

        for (let round = 1; round <= 4; round++) {
            const attempts = Array.isArray(plan.rounds[round]) ? plan.rounds[round] : [];
            for (const attempt of attempts) {
                const response = await this._request(`/search/${type}`, this._buildSearchParams(type, attempt.title, attempt.year));
                if (response?.results?.length > 0) {
                    const detail = await this._pickBestMatchDetail(type, response.results, attempt.title, attempt.year, currentEpisodes);
                    if (detail) return detail;
                }
            }
        }
        return null;
    }

    async _applySeasonContext(tvInfo, rawTitle) {
        const parsed = parseMediaTitle(rawTitle || '');
        const seasonNumber = Number(parsed?.season || 0);
        if (!seasonNumber || seasonNumber <= 0) {
            return tvInfo;
        }

        const seasonDetail = await this.getTVSeasonDetails(tvInfo.id, seasonNumber);
        if (!seasonDetail) {
            return {
                ...tvInfo,
                seasonNumber
            };
        }

        this._logSearch(`识别季: S${String(seasonNumber).padStart(2, '0')}，TMDB季集数: ${seasonDetail.episodeCount || 0}`);
        return {
            ...tvInfo,
            seasonNumber,
            seasonName: seasonDetail.name || '',
            seasonEpisodes: seasonDetail.episodeCount || 0,
            totalEpisodes: seasonDetail.episodeCount || tvInfo.totalEpisodes || 0,
            tmdbSeasonUrl: `https://www.themoviedb.org/tv/${tvInfo.id}/season/${seasonNumber}`
        };
    }

    async getTVDetails(id) {
        try {
            const response = await this._withCache(`tmdb:tv:${id}`, 'tv_detail', async () => {
                return await this._request(`/tv/${id}`, { append_to_response: 'credits,images' });
            }, 86400 * 7);
            return {
                id: response.id,
                title: response.name,
                name: response.name,
                originalTitle: response.original_name,
                original_name: response.original_name,
                releaseDate: response.first_air_date,
                type: 'tv',
                totalEpisodes: response.number_of_episodes || 0,
                number_of_episodes: response.number_of_episodes || 0,
                seasons: response.seasons || [],
                lastEpisodeToAir: response.last_episode_to_air,
                status: response.status
            };
        } catch (e) { return null; }
    }

    async getTVSeasonDetails(id, seasonNumber) {
        try {
            const response = await this._withCache(`tmdb:tv:${id}:season:${seasonNumber}`, 'tv_season_detail', async () => {
                return await this._request(`/tv/${id}/season/${seasonNumber}`);
            }, 86400 * 7);
            return {
                id: response.id,
                title: response.name,
                name: response.name,
                seasonNumber: response.season_number || Number(seasonNumber),
                episodeCount: Array.isArray(response.episodes) ? response.episodes.length : Number(response.episode_count || 0),
                airDate: response.air_date || '',
                episodes: response.episodes || [],
                tmdbUrl: `https://www.themoviedb.org/tv/${id}/season/${seasonNumber}`
            };
        } catch (e) { return null; }
    }

    async getMovieDetails(id) {
        try {
            const response = await this._withCache(`tmdb:movie:${id}`, 'movie_detail', async () => {
                return await this._request(`/movie/${id}`, { append_to_response: 'credits,images' });
            }, 86400 * 7);
            return {
                id: response.id,
                title: response.title,
                name: response.title,
                originalTitle: response.original_title,
                original_name: response.original_title,
                releaseDate: response.release_date,
                type: 'movie'
            };
        } catch (e) { return null; }
    }

    async getEpisodeDetails(showId, season, episode) {
        try {
            return await this._request(`/tv/${showId}/season/${season}/episode/${episode}`);
        } catch (e) { return null; }
    }

    async getTrending(mediaType = 'all', timeWindow = 'day') {
        try {
            return await this._withCache(`tmdb:trending:${mediaType}:${timeWindow}`, 'trending', async () => {
                const response = await this._request(`/trending/${mediaType}/${timeWindow}`);
                return response.results;
            }, 21600);
        } catch (error) {
            throw new Error(`获取 TMDB 趋势失败: ${error.message}`);
        }
    }

    async getPopular(mediaType = 'movie', page = 1) {
        try {
            return await this._withCache(`tmdb:popular:${mediaType}:${page}`, 'popular', async () => {
                return await this._request(`/${mediaType}/popular`, { page });
            }, 21600);
        } catch (error) {
            throw new Error(`获取 TMDB 热门失败: ${error.message}`);
        }
    }

    async getDiscover(mediaType = 'movie', params = {}) {
        try {
            const response = await this._request(`/discover/${mediaType}`, params);
            return response;
        } catch (error) {
            throw new Error(`获取 TMDB 发现失败: ${error.message}`);
        }
    }
}

module.exports = { TMDBService };
