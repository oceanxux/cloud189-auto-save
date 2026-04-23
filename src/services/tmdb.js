const got = require('got');
const ConfigService = require('./ConfigService');
const ProxyUtil = require('../utils/ProxyUtil');
const { logTaskEvent } = require('../utils/logUtils');
const { parseMediaTitle } = require('../utils/mediaTitleParser');
class TMDBService {
    constructor() {
        this.apiKey = ConfigService.getConfigValue('tmdb.tmdbApiKey') || ConfigService.getConfigValue('tmdb.apiKey');
        this.baseURL = 'https://api.themoviedb.org/3';
        this.language = 'zh-CN';
    }

    _logSearch(message) {
        const line = String(message || '');
        if (!line) {
            return;
        }
        console.log(line);
        logTaskEvent(line);
    }

    _buildSearchParams(type, title, year = '') {
        const params = {
            query: title
        };
        if (year) {
            if (type === 'tv') {
                params.first_air_date_year = year;
            } else {
                params.year = year;
            }
        }
        return params;
    }

    _buildLayeredSearchPlan(rawTitle, year = '') {
        const parsed = parseMediaTitle(rawTitle);
        const fallbackTitle = String(rawTitle || '').trim();
        const cleanTitle = parsed.cleanTitle || fallbackTitle;
        const externalYear = String(year || '').trim();
        const parsedYear = parsed.year ? String(parsed.year) : '';
        const resolvedYear = externalYear || parsedYear;
        const aliases = Array.isArray(parsed.aliases) ? parsed.aliases : [];
        const dedupe = new Set();

        const uniqueAliases = aliases.filter(item => {
            const key = String(item || '').trim().toLowerCase();
            if (!key || key === cleanTitle.toLowerCase() || dedupe.has(key)) {
                return false;
            }
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
        this._logSearch(`提取季：${parsed.season || '无'}`);
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
            if (type === 'tv') {
                return await this.getTVDetails(media.id);
            }
            return await this.getMovieDetails(media.id);
        });

        const details = await Promise.all(detailPromises);
        const validDetails = details.filter(Boolean);
        if (!validDetails.length) {
            this._logSearch(`TMDB搜索${type}详情请求全部失败`);
            return null;
        }

        const bestMatch = validDetails.reduce((best, current) => {
            if (!current) {
                return best;
            }

            let score = 0;
            if (String(current.title || '').toLowerCase() === String(searchTitle || '').toLowerCase()) {
                score += 10;
            }

            const mediaYear = Number(new Date(current.releaseDate).getFullYear() || 0);
            if (searchYear && mediaYear === Number.parseInt(searchYear, 10)) {
                score += 5;
            }

            if (type === 'tv' && currentEpisodes > 0) {
                const latestEpisode = Number(current?.lastEpisodeToAir?.episode_number || 0);
                if (latestEpisode > 0) {
                    if (current.status === 'Returning Series' && currentEpisodes <= latestEpisode) {
                        score += 5;
                    }
                    if (current.status === 'Ended' && Math.abs(latestEpisode - currentEpisodes) <= 2) {
                        score += 5;
                    }
                    if (currentEpisodes > latestEpisode) {
                        score -= 3;
                    }
                    this._logSearch(`匹配分析 - ${current.title}: 分数=${score}, 最近一次集数=${latestEpisode}, 已有集数=${currentEpisodes}, 状态=${current.status}`);
                }
            }

            return (!best || score > best.score) ? { ...current, score } : best;
        }, null);

        this._logSearch(`最佳匹配结果: ${bestMatch?.title || '空'}, 分数: ${bestMatch?.score ?? '无'}`);
        if (!bestMatch?.id) {
            return null;
        }

        if (type === 'tv') {
            return await this.getTVDetails(bestMatch.id);
        }
        return await this.getMovieDetails(bestMatch.id);
    }

    async _request(endpoint, params = {}) {
        const proxy = ProxyUtil.getProxyAgent('tmdb');
        try {
            // DNS解析开始
            const response = await got(`${this.baseURL}${endpoint}`, {
                searchParams:{
                    api_key: this.apiKey,
                    language: this.language,
                    ...params
                },
                agent: proxy
            }).json();
            return response;
        } catch (error) {
            console.error(`TMDB请求失败 [${endpoint}]:`, {
                message: error.message
            });
            throw error;
        }
    }
    
    async search(title, year = '') {
        try {
            console.log(`TMDB搜索：${title}，年份：${year}`);
            const response = await this._request('/search/multi', {
                query: title,
                year: year
            });

            console.log(`TMDB搜索结果数量：${response.results.length}`);
            
            // 分离电影和电视剧结果
            const movies = response.results
                .filter(item => item.media_type === 'movie')
                .map(item => ({
                    id: item.id,
                    title: item.title,
                    originalTitle: item.original_title,
                    overview: item.overview,
                    releaseDate: item.release_date,
                    posterPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w500${item.backdrop_path}` : '',
                    voteAverage: item.vote_average,
                    type: 'movie'
                }));

            const tvShows = response.results
                .filter(item => item.media_type === 'tv')
                .map(item => ({
                    id: item.id,
                    title: item.name,
                    originalTitle: item.original_name,
                    overview: item.overview,
                    releaseDate: item.first_air_date,
                    posterPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w500${item.backdrop_path}` : '',
                    voteAverage: item.vote_average,
                    type: 'tv'
                }));

            return {
                movies: movies.slice(0, 5),
                tvShows: tvShows.slice(0, 5)
            };
        } catch (error) {
            throw new Error(`TMDB搜索失败: ${error.message}`);
        }
    }

    async searchMovie(title, year = '') {
        try {
            const movies = await this._searchMedia('movie', title, year, 1);
            return movies;
        } catch (error) {
            throw new Error(`TMDB电影搜索失败: ${error.message}`);
        }
    }

    async searchTV(title, year = '', currentEpisodes) {
        try {
            const tvShows = await this._searchMedia('tv', title, year, currentEpisodes);
            return tvShows;
        } catch (error) {
            throw new Error(`TMDB电视剧搜索失败: ${error.message}`);
        }
    }

    async _searchMedia(type, title, year, currentEpisodes = 0) {
        const plan = this._buildLayeredSearchPlan(title, year);
        this._logParsedContext(plan.parsed, plan.cleanTitle, plan.resolvedYear);
        this._logSearch(`TMDB搜索${type}：${plan.cleanTitle || title}，年份：${plan.resolvedYear || '无'}，已有集数：${currentEpisodes}`);

        for (let round = 1; round <= 4; round++) {
            const attempts = Array.isArray(plan.rounds[round]) ? plan.rounds[round] : [];
            if (attempts.length === 0) {
                this._logSearch(`TMDB第${round}轮搜索：跳过（无可用标题）`);
                continue;
            }

            for (const attempt of attempts) {
                const searchLabel = `${attempt.title}${attempt.year ? ` / ${attempt.year}` : ''}`;
                this._logSearch(`TMDB第${round}轮搜索：${searchLabel}`);
                const response = await this._request(`/search/${type}`, this._buildSearchParams(type, attempt.title, attempt.year));
                const count = Array.isArray(response?.results) ? response.results.length : 0;
                this._logSearch(`TMDB第${round}轮结果数量：${count}`);
                if (!count) {
                    continue;
                }

                const detail = await this._pickBestMatchDetail(type, response.results, attempt.title, attempt.year, currentEpisodes);
                if (detail?.id) {
                    this._logSearch(`最终命中：${detail.title} (ID=${detail.id})`);
                    return detail;
                }
            }
        }

        this._logSearch('最终命中：无');
        return null;
    }

    async getTVDetails(id) {
        try {
            const response = await this._request(`/tv/${id}`, {
                append_to_response: 'credits,images'
            });
            // 如果没有图片信息，使用英文重新获取
            if (!response.images?.logos?.length) {
                const imagesResponse = await this._request(`/tv/${id}/images`, {
                    language: '' // 置空语言以获取所有图片
                });
                response.images = imagesResponse;
            }
            return {
                id: response.id,
                title: response.name,
                originalTitle: response.original_name,
                overview: response.overview,
                releaseDate: response.first_air_date,
                posterPath: response.poster_path ? `https://image.tmdb.org/t/p/w500${response.poster_path}` : null,
                backdropPath: response.backdrop_path? `https://image.tmdb.org/t/p/w500${response.backdrop_path}` : null,
                logoPath: response.images?.logos?.[0]?.file_path ? `https://image.tmdb.org/t/p/w500${response.images.logos[0].file_path}` : null,
                voteAverage: response.vote_average,
                cast: response.credits?.cast || [],
                type: 'tv',
                totalSeasons: response.number_of_seasons || 0,
                totalEpisodes: response.number_of_episodes || 0,
                seasons: response.seasons,
                lastEpisodeToAir: response.last_episode_to_air,
                status: response.status,
                genres: response.genres || []
            };
            
        } catch (error) {
            console.error(`获取电视剧详情失败: ${error.message}`);
            return null;
        }
    }

    async getMovieDetails(id) {
        try {
            const response = await this._request(`/movie/${id}`, {
                append_to_response: 'credits,images'
            });
            // 如果没有图片信息，使用英文重新获取
            if (!response.images?.logos?.length) {
                const imagesResponse = await this._request(`/movie/${id}/images`, {
                    language: '' // 置空语言以获取所有图片
                });
                response.images = imagesResponse;
            }
            return {
                id: response.id,
                title: response.title,
                originalTitle: response.original_title,
                overview: response.overview,
                releaseDate: response.release_date,
                posterPath: response.poster_path ? `https://image.tmdb.org/t/p/w500${response.poster_path}` : null,
                logoPath: response.images?.logos?.[0]?.file_path ? `https://image.tmdb.org/t/p/w500${response.images.logos[0].file_path}` : null,
                voteAverage: response.vote_average,
                cast: response.credits?.cast || [],
                genres: response.genres || [],
                type: 'movie'
            };
        } catch (error) {
            console.error(`获取电影详情失败: ${error.message}`);
            return null;
        }
    }

    async getEpisodeDetails(showId, season, episode) {
        try {
            console.log('获取剧集信息:', showId, season, episode);
            const response = await this._request(
                `/tv/${showId}/season/${season}/episode/${episode}`,
                { append_to_response: 'credits' }
            );
            return {
                ...response,
                stillPath: response.still_path?`https://image.tmdb.org/t/p/w500${response.still_path}` : null,
                cast: response.credits?.cast || []
            };
        } catch (error) {
            console.error(`获取剧集详情失败: ${error.message}`);
            return null;
        }
    }
}

module.exports = { TMDBService };
