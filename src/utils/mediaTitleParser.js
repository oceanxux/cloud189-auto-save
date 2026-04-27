const SEASON_EPISODE_PATTERNS = [
    /(?:^|[\s._-])S(\d{1,2})\s*E(\d{1,3})(?=[\s._-]|$)/i,
    /(?:^|[\s._-])(\d{1,2})x(\d{1,3})(?=[\s._-]|$)/i,
    /(?:^|[\s._-])S(\d{1,2})(?=[\s._-]|$)/i,
    /(?:^|[\s._-])Season\s*(\d{1,2})(?=[\s._-]|$)/i,
    /(?:^|[\s._-])第\s*(\d{1,2})\s*季(?=[\s._-]|$)/i
];

const CN_NUMBER_MAP = new Map([
    ['零', 0], ['一', 1], ['二', 2], ['两', 2], ['三', 3], ['四', 4], ['五', 5],
    ['六', 6], ['七', 7], ['八', 8], ['九', 9], ['十', 10]
]);

function parseChineseNumber(text = '') {
    const normalized = String(text || '').trim();
    if (!normalized) return null;
    if (/^\d+$/.test(normalized)) return parseInt(normalized, 10);
    if (normalized === '十') return 10;
    if (normalized.startsWith('十')) {
        const tail = CN_NUMBER_MAP.get(normalized.slice(1));
        return tail != null ? 10 + tail : null;
    }
    if (normalized.endsWith('十')) {
        const head = CN_NUMBER_MAP.get(normalized.slice(0, -1));
        return head != null ? head * 10 : null;
    }
    const tenIndex = normalized.indexOf('十');
    if (tenIndex > 0) {
        const head = CN_NUMBER_MAP.get(normalized.slice(0, tenIndex));
        const tail = CN_NUMBER_MAP.get(normalized.slice(tenIndex + 1));
        if (head != null && tail != null) {
            return head * 10 + tail;
        }
    }
    return CN_NUMBER_MAP.get(normalized) ?? null;
}

const NOISE_PATTERNS = [
    /\b(?:2160|1080|720|480)p\b/ig,
    /\bweb[\s.-]?dl\b/ig,
    /\bwebrip\b/ig,
    /\bblu[\s.-]?ray\b/ig,
    /\bhdr10\b/ig,
    /\bhdr\b/ig,
    /\bdv\b/ig,
    /\bhevc\b/ig,
    /\bh\s*265\b/ig,
    /\bh\s*264\b/ig,
    /\bx\s*265\b/ig,
    /\bx\s*264\b/ig,
    /\baac\b/ig,
    /\bflac\b/ig,
    /\bddp\b/ig,
    /\batmos\b/ig,
    /\bvivid\b/ig,
    /\b(?:50|60)\s*fps\b/ig,
    /\bhiveweb\b/ig,
    /\bAMZN\b/ig,
    /\bNF\b/ig,
    /\bDSNP\b/ig,
    /\bHMAX\b/ig,
    /\bVPP\b/ig,
    /\b\d+\s*audios?\b/ig,
    /仅秒传/ig
];

function normalizeSpaces(text) {
    return text.replace(/[\s._]+/g, ' ').trim();
}

function parseMediaTitle(source) {
    let text = source || '';
    
    // 1. 先把所有点号、下划线转换为空格，方便后续匹配
    text = text.replace(/[._]/g, ' ');
    const textForSeasonEpisode = text;

    // 2. 暴力截断：遇到常见的元数据起始符，直接砍掉后面所有内容
    // 增加对不带空格的 + 的处理
    const TRUNCATE_KEYWORDS = [
        ' + ', ' | ', ' - ', ' [', '(', 
        '2160p', '1080p', '720p', 
        'AMZN', 'WEB-DL', 'WEBRip', 'BluRay'
    ];
    
    for (const kw of TRUNCATE_KEYWORDS) {
        const idx = text.toLowerCase().indexOf(kw.toLowerCase());
        if (idx !== -1) {
            text = text.substring(0, idx);
        }
    }

    // 3. 再次处理一些粘连的垃圾后缀（如 HDR10+, MULTi）
    text = text.replace(/\+/g, ' ')
               .replace(/\b(MULTi|HDR10|DV|HDR|HEVC|H264|H265|x264|x265)\b/ig, ' ');

    let year = null, season = null, episode = null;
    const removedTokens = [];

    // 4. 提取年份 (通常是 4 位数字)
    const yearMatch = textForSeasonEpisode.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) {
        year = parseInt(yearMatch[1]);
        // 提取完年份后，如果是作为后缀的年份，可以考虑截断
    }

    // 5. 提取季度和集数
    for (const pattern of SEASON_EPISODE_PATTERNS) {
        const match = textForSeasonEpisode.match(pattern);
        if (match) {
            if (match[1]) season = parseInt(match[1]);
            if (match[2]) episode = parseInt(match[2]);
            removedTokens.push(match[0]);
            break;
        }
    }

    if (season == null) {
        const chineseSeasonMatch = textForSeasonEpisode.match(/第\s*([零一二两三四五六七八九十百\d]{1,4})\s*季/i);
        if (chineseSeasonMatch?.[1]) {
            const parsedSeason = parseChineseNumber(chineseSeasonMatch[1]);
            if (parsedSeason != null) {
                season = parsedSeason;
                removedTokens.push(chineseSeasonMatch[0]);
            }
        }
    }

    // 6. 执行常规噪声清理 (仅保留看起来像名称的部分)
    for (const pattern of NOISE_PATTERNS) {
        const matches = text.match(pattern);
        if (matches) {
            removedTokens.push(...matches);
            text = text.replace(pattern, ' ');
        }
    }

    // 7. 最后的精细清理：去掉末尾的纯数字（如果它看起来像集数而非标题的一部分）
    // 注意：Crime 101 的 101 应该保留，所以我们只去删掉孤立的、超过 3 位的或者前面有 E/S 的
    text = text
        .replace(/(?:^|\s)S\d{1,2}\s*E\d{1,3}(?=\s|$)/ig, ' ')
        .replace(/(?:^|\s)S\d{1,2}(?=\s|$)/ig, ' ')
        .replace(/(?:^|\s)Season\s*\d{1,2}(?=\s|$)/ig, ' ')
        .replace(/第\s*(?:[零一二两三四五六七八九十百\d]{1,4})\s*季/ig, ' ')
        .replace(/\b(19\d{2}|20\d{2})\b/g, ' ')
        .replace(/[\s-+;|]+$/g, ' ');

    const cleanTitle = normalizeSpaces(text);

    return {
        rawName: source,
        cleanTitle,
        year,
        season,
        episode,
        aliases: [],
        removedTokens
    };
}

module.exports = { parseMediaTitle };
