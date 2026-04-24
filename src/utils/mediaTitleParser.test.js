const assert = require('assert');
const { parseMediaTitle } = require('./mediaTitleParser');

const cases = [
    {
        input: 'Unpredictable.S01.2026.2160p.WEB-DL.HDR.Vivid.H.265.50FPS.FLAC-HiveWeb',
        expected: {
            cleanTitle: 'Unpredictable',
            year: 2026,
            season: 1,
            episode: null
        }
    },
    {
        input: 'Sword.of.Coming.S01E08.2160p.WEB-DL.HEVC.DDP.3Audios.mp4',
        expected: {
            cleanTitle: 'Sword of Coming',
            year: null,
            season: 1,
            episode: 8
        }
    },
    {
        input: '叵测.S01E03.2160p.WEB-DL.mkv',
        expected: {
            cleanTitle: '叵测',
            year: null,
            season: 1,
            episode: 3
        }
    },
    {
        input: '北上 - S01E01.mp4',
        expected: {
            cleanTitle: '北上',
            year: null,
            season: 1,
            episode: 1
        }
    },
    {
        input: 'Season 01',
        expected: {
            cleanTitle: '',
            year: null,
            season: 1,
            episode: null
        }
    }
];

for (const item of cases) {
    const parsed = parseMediaTitle(item.input);
    assert.strictEqual(parsed.cleanTitle, item.expected.cleanTitle, `cleanTitle mismatch: ${item.input}`);
    assert.strictEqual(parsed.year, item.expected.year, `year mismatch: ${item.input}`);
    assert.strictEqual(parsed.season, item.expected.season, `season mismatch: ${item.input}`);
    assert.strictEqual(parsed.episode, item.expected.episode, `episode mismatch: ${item.input}`);
}

console.log(`mediaTitleParser tests passed: ${cases.length}`);
