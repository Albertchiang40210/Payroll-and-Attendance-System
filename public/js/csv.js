// 薪資頁匯出 Excel 用：把二維陣列轉成 CSV（可在瀏覽器使用，也能在 Node 測試）
(function (root) {
    // 以 = + - @ 開頭的「文字」可能被 Excel 當成公式執行，前面補一個單引號
    function escapeCell(value) {
        if (value === null || value === undefined) return '';
        let s = String(value);
        if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }

    // 開頭加上 BOM，Excel 才不會把中文讀成亂碼
    function toCsv(rows) {
        return `﻿${rows.map((r) => r.map(escapeCell).join(',')).join('\r\n')}\r\n`;
    }

    function download(filename, rows) {
        const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    const api = { escapeCell, toCsv, download };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.CSV = api;
})(typeof window !== 'undefined' ? window : globalThis);
