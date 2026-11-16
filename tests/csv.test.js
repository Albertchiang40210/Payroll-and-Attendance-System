const { toCsv, escapeCell } = require('../public/js/csv');

describe('CSV export helper (used by the salary page)', () => {
    it('starts with a BOM so Excel reads Chinese correctly', () => {
        expect(toCsv([['姓名']]).startsWith('﻿')).toBe(true);
    });

    it('joins cells with commas and rows with CRLF', () => {
        expect(toCsv([['a', 'b'], [1, 2]])).toBe('﻿a,b\r\n1,2\r\n');
    });

    it('quotes cells that contain commas, quotes or line breaks', () => {
        expect(escapeCell('a,b')).toBe('"a,b"');
        expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
        expect(escapeCell('line1\nline2')).toBe('"line1\nline2"');
    });

    it('writes empty cells for null and undefined', () => {
        expect(toCsv([[null, undefined, 0]])).toBe('﻿,,0\r\n');
    });

    it('neutralizes spreadsheet formulas typed into text cells', () => {
        expect(escapeCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
        expect(escapeCell('+1')).toBe("'+1");
        expect(escapeCell('@cmd')).toBe("'@cmd");
        expect(escapeCell('-x')).toBe("'-x");
    });

    it('leaves real numbers and ordinary text untouched', () => {
        expect(escapeCell(-5)).toBe('-5');
        expect(escapeCell(190)).toBe('190');
        expect(escapeCell('王小明')).toBe('王小明');
    });
});
