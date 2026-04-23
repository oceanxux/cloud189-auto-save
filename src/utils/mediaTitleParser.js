const SEASON_EPISODE_PATTERNS = [
    /(?:^|\s)S(\d{1,2})\s*E(\d{1,3})(?=\s|$)/i,
    /(?:^|\s)(\d{1,2})x(\d{1,3})(?=\s|$)/i,
    /(?:^|\s)S(\d{1,2})(?=\s|$)/i
];

const NOISE_PATTERNS = [
    /\b(?:2160|1080|720|480)p\b/ig,
    /\bweb[\s.-]?dl\b/ig,
    /\bwebrip\b/ig,
    /\bblu[\s.-]?ray\b/ig,
    /\bhdr10\+?\b/ig,
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
    /\b\d+\s*audios?\b/ig,
    /仅秒传/ig,
    /\b\d+\s+\d+\s*(?:kb|mb|gb|tb)\b/ig,
    /\b\d+(?:\.\d+)?\s*(?:kb|mb|gb|tb)\b/ig
];

function pushRemovedToken(bucket, values) {
    for (const value of values || []) {
        const token = String(value || '').trim();
        if (!token) {
            continue;
        }
        const exists = bucket.some(item => item.toLowerCase() === token.toLowerCase());
        if (!exists) {
            bucket.push(token);
        }
    }
}

function removePattern(input, pattern, removedTokens) {
    const text = String(input || '');
    const matches = [...text.matchAll(pattern)].map(item => item[0]);
    if (matches.length > 0) {
        pushRemovedToken(removedTokens, matches);
    }
    return text.replace(pattern, ' ');
}

function normalizeSpaces(input) {
    return String(input || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractAliases(rawTitle = '') {
    const aliases = [];
    const bracketRegex = /[\[【(（]([^\]】)）]{2,80})[\]】)）]/g;
    for (const match of rawTitle.matchAll(bracketRegex)) {
        aliases.push(match[1]);
    }

    const splitCandidates = String(rawTitle || '')
        .split(/[\/|｜]/)
        .map(item => item.trim())
        .filter(Boolean);
    if (splitCandidates.length > 1) {
        aliases.push(...splitCandidates);
    }

    return aliases;
}

function cleanAlias(alias = '') {
    let value = String(alias || '')
        .replace(/[._]/g, ' ')
        .replace(/-/g, ' ')
        .replace(/[【】\[\]（）()]/g, ' ');

    for (const pattern of NOISE_PATTERNS) {
        value = value.replace(pattern, ' ');
    }

    value = value
        .replace(/(?:^|\s)S\d{1,2}\s*E\d{1,3}(?=\s|$)/ig, ' ')
        .replace(/(?:^|\s)\d{1,2}x\d{1,3}(?=\s|$)/ig, ' ')
        .replace(/(?:^|\s)S\d{1,2}(?=\s|$)/ig, ' ')
        .replace(/\b(19\d{2}|20\d{2})\b/g, ' ')
        .replace(/\b(?:mkv|mp4|avi|mov|m4v|ts|flv|wmv|srt|ass|ssa|strm|iso)\b/ig, ' ');

    return normalizeSpaces(value);
}

function parseMediaTitle(rawName = '') {
    const source = String(rawName || '').trim();
    const removedTokens = [];
    if (!source) {
        return {
            rawName: '',
            cleanTitle: '',
            year: null,
            season: null,
            episode: null,
            aliases: [],
            removedTokens
        };
    }

    let text = source;
    text = text.replace(/\.(mkv|mp4|avi|mov|m4v|ts|flv|wmv|srt|ass|ssa|strm|iso)$/i, (match) => {
        pushRemovedToken(removedTokens, [match]);
        return '';
    });

    text = text.replace(/仅秒传\s*\d+(?:\.\d+)?\s*(?:kb|mb|gb|tb)?/ig, (match) => {
        pushRemovedToken(removedTokens, [match]);
        return ' ';
    });

    const rawAliases = extractAliases(text);

    text = text
        .replace(/[._]/g, ' ')
        .replace(/-/g, ' ')
        .replace(/[【】\[\]（）()]/g, ' ');

    let season = null;
    let episode = null;
    for (const pattern of SEASON_EPISODE_PATTERNS) {
        const matched = text.match(pattern);
        if (!matched) {
            continue;
        }
        season = Number(matched[1]);
        episode = matched[2] ? Number(matched[2]) : null;
        pushRemovedToken(removedTokens, [matched[0]]);
        break;
    }

    const yearMatch = text.match(/\b(19\d{2}|20\d{2})\b/);
    const year = yearMatch ? Number(yearMatch[1]) : null;
    if (yearMatch) {
        pushRemovedToken(removedTokens, [yearMatch[0]]);
    }

    for (const pattern of NOISE_PATTERNS) {
        text = removePattern(text, pattern, removedTokens);
    }

    text = text
        .replace(/(?:^|\s)S\d{1,2}\s*E\d{1,3}(?=\s|$)/ig, ' ')
        .replace(/(?:^|\s)\d{1,2}x\d{1,3}(?=\s|$)/ig, ' ')
        .replace(/(?:^|\s)S\d{1,2}(?=\s|$)/ig, ' ')
        .replace(/\b(19\d{2}|20\d{2})\b/g, ' ')
        .replace(/(?:^|\s)\d{1,3}(?=\s*$)/g, ' ')
        .replace(/[\s-]+$/g, ' ');

    const cleanTitle = normalizeSpaces(text);

    const aliases = rawAliases
        .map(item => cleanAlias(item))
        .filter(Boolean)
        .filter(item => item.toLowerCase() !== cleanTitle.toLowerCase())
        .filter((item, index, arr) => arr.findIndex(current => current.toLowerCase() === item.toLowerCase()) === index);

    return {
        rawName: source,
        cleanTitle,
        year,
        season,
        episode,
        aliases,
        removedTokens
    };
}

module.exports = {
    parseMediaTitle
};
