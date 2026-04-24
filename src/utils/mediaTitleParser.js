const SEASON_EPISODE_PATTERNS = [
    /(?:^|\s)S(\d{1,2})\s*E(\d{1,3})(?=\s|$)/i,
    /(?:^|\s)(\d{1,2})x(\d{1,3})(?=\s|$)/i,
    /(?:^|\s)S(\d{1,2})(?=\s|$)/i,
    /(?:^|\s)Season\s*(\d{1,2})(?=\s|$)/i,
    /(?:^|\s)第\s*(\d{1,2})\s*季(?=\s|$)/i
];

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
    const yearMatch = text.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) {
        year = parseInt(yearMatch[1]);
        // 提取完年份后，如果是作为后缀的年份，可以考虑截断
    }

    // 5. 提取季度和集数
    for (const pattern of SEASON_EPISODE_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
            if (match[1]) season = parseInt(match[1]);
            if (match[2]) episode = parseInt(match[2]);
            removedTokens.push(match[0]);
            break;
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
