function normalizeSegment(value = '') {
    return String(value || '').trim();
}

function isGenericSeasonFolder(value = '') {
    const text = normalizeSegment(value);
    if (!text) {
        return false;
    }
    return /^(season|series|s)\s*[-_. ]?\d{1,3}$/i.test(text)
        || /^第\s*[一二三四五六七八九十百零\d]+\s*季$/i.test(text)
        || /^s\d{1,2}$/i.test(text);
}

function resolveWorkflowResourceName(groupParts = []) {
    const parts = Array.isArray(groupParts)
        ? groupParts.map(item => normalizeSegment(item)).filter(Boolean)
        : [];
    if (parts.length === 0) {
        return '';
    }

    const leaf = parts[parts.length - 1];
    if (parts.length >= 2 && isGenericSeasonFolder(leaf)) {
        return parts[parts.length - 2];
    }
    return leaf;
}

module.exports = {
    isGenericSeasonFolder,
    resolveWorkflowResourceName
};
