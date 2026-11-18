// 把薪資報表轉成 Excel（.xlsx）：「應發薪資」與「每人打卡明細」兩個檔案
const writeExcelFile = require('write-excel-file/node');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const STORE = '車庫小籠包';

const monthTitle = (month) => `${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月`;
const weekdayOf = (date) => WEEKDAYS[dayjs.utc(date).day()];
const nowText = () => dayjs().tz(TZ).format('YYYY-MM-DD HH:mm');

// ---- 儲存格樣式 ----
const BORDER = { borderColor: '#c9d1d9', borderStyle: 'thin' };
const head = (value, align = 'left') => ({
    value, fontWeight: 'bold', backgroundColor: '#e3f1ed', align, alignVertical: 'center', ...BORDER
});
const text = (value, extra = {}) => ({ value: value ?? '', ...BORDER, ...extra });
const num = (value, format, extra = {}) => ({
    value: Number(value) || 0, type: Number, format, align: 'right', ...BORDER, ...extra
});
const title = (value, span) => [
    { value, fontWeight: 'bold', fontSize: 14, columnSpan: span },
    ...Array(span - 1).fill(null)
];
const note = (value, span, extra = {}) => [
    { value, textColor: '#5b6470', columnSpan: span, ...extra },
    ...Array(span - 1).fill(null)
];

// Excel 分頁名稱：最多 31 字，不可含 [ ] : * ? / \，且不可重複
function sheetName(name, used) {
    let base = String(name).replace(/[\[\]:*?/\\]/g, '').trim().slice(0, 28) || '員工';
    let candidate = base;
    for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base}_${i}`;
    used.add(candidate.toLowerCase());
    return candidate;
}

// ===== 檔案 1：應發薪資 =====
exports.payrollSheets = (report, month) => {
    const { summary, incomplete } = report;
    const cols = 6;
    const missingBy = {};
    incomplete.forEach((r) => (missingBy[r.emp_id] = (missingBy[r.emp_id] || 0) + 1));

    const data = [
        title(`${STORE}　${monthTitle(month)}　應發薪資`, cols),
        note('只計入已完成上下班打卡的紀錄；加班與正常班一律按時薪 × 工時計算，不加成。', cols),
        [head('員工'), head('時薪', 'right'), head('總工時（小時）', 'right'), head('休假天數', 'right'),
            head('應發薪資', 'right'), head('備註')]
    ];

    if (summary.length === 0) {
        data.push(note('這個月份沒有完整的打卡紀錄。', cols));
    } else {
        let hours = 0;
        let salary = 0;
        summary.forEach((s) => {
            hours += Number(s.total_hours);
            salary += s.total_salary;
            const remarks = [];
            if (s.rate_changed) remarks.push('月中調整時薪，此欄為月底時薪，各日時薪見打卡明細');
            if (missingBy[s.emp_id]) remarks.push(`有 ${missingBy[s.emp_id]} 天只打了上班卡、沒打下班卡，未計入`);
            data.push([
                text(s.name, { fontWeight: 'bold' }),
                num(s.hourly_rate, '#,##0.##'),
                num(s.total_hours, '0.00'),
                num(s.day_off_count || 0, '0'),
                num(s.total_salary, '#,##0', { fontWeight: 'bold' }),
                text(remarks.join('；'), remarks.length ? { textColor: '#b42318' } : {})
            ]);
        });
        const foot = { fontWeight: 'bold', backgroundColor: '#f4f6f8' };
        data.push([
            text('合計', foot), text('', foot), num(hours, '0.00', foot), text('', foot),
            num(salary, '#,##0', foot), text('', foot)
        ]);
    }
    data.push([]);
    data.push(note(`報表產生時間：${nowText()}（台北時間）`, cols));

    return [{
        sheet: '應發薪資',
        data,
        columns: [{ width: 16 }, { width: 10 }, { width: 16 }, { width: 11 }, { width: 14 }, { width: 46 }],
        stickyRowsCount: 3,
        orientation: 'landscape'
    }];
};

// ===== 檔案 2：每人打卡明細（每位員工一個分頁）=====
exports.detailSheets = (report, month) => {
    const { summary, details, incomplete } = report;
    const cols = 9;
    const used = new Set();

    const sheets = summary.map((s) => {
        const rows = [
            ...details.filter((d) => d.emp_id === s.emp_id).map((d) => ({
                date: d.work_date, type: d.punch_type, in: d.day_off ? '' : d.log_in, out: d.day_off ? '' : d.log_out,
                hours: d.day_hours, rate: d.hourly_rate, earned: d.earned,
                remark: d.day_off ? '' : d.manual ? '補登' : '', dayOff: !!d.day_off
            })),
            ...incomplete.filter((r) => r.emp_id === s.emp_id).map((r) => ({
                date: r.work_date, type: r.punch_type, in: r.log_in, out: '', hours: null, rate: null, earned: null,
                remark: '只打了上班卡，沒打下班卡，未計入薪資', missing: true
            }))
        ].sort((a, b) => (a.date === b.date ? String(a.in).localeCompare(String(b.in)) : a.date < b.date ? -1 : 1));

        const data = [
            title(`${s.name}　${monthTitle(month)}　打卡明細`, cols),
            note('金額 = 工時 × 當日時薪（四捨五入到整數）；加班不加成。', cols),
            [head('日期'), head('星期'), head('班別'), head('上班', 'right'), head('下班', 'right'),
                head('工時（小時）', 'right'), head('時薪', 'right'), head('金額', 'right'), head('備註')]
        ];

        rows.forEach((r) => {
            const gray = r.dayOff ? { textColor: '#8a929c' } : {};
            const red = r.missing ? { textColor: '#b42318' } : {};
            data.push([
                text(r.date, { ...gray, ...red }),
                text(weekdayOf(r.date), { ...gray, ...red }),
                text(r.type, { ...gray, ...red }),
                text(r.in, { align: 'right', ...gray, ...red }),
                text(r.out, { align: 'right', ...gray, ...red }),
                r.hours === null ? text('') : num(r.hours, '0.00', gray),
                r.rate === null ? text('') : num(r.rate, '#,##0.##', gray),
                r.earned === null ? text('') : num(r.earned, '#,##0', gray),
                text(r.remark, { ...gray, ...red })
            ]);
        });

        const foot = { fontWeight: 'bold', backgroundColor: '#f4f6f8' };
        data.push([
            text('合計', foot), text('', foot), text('', foot), text('', foot), text('', foot),
            num(s.total_hours, '0.00', foot), text('', foot), num(s.total_salary, '#,##0', foot),
            text(s.day_off_count ? `休假 ${s.day_off_count} 天` : '', foot)
        ]);

        return {
            sheet: sheetName(s.name, used),
            data,
            columns: [{ width: 12 }, { width: 6 }, { width: 8 }, { width: 10 }, { width: 10 },
                { width: 13 }, { width: 9 }, { width: 11 }, { width: 38 }],
            stickyRowsCount: 3
        };
    });

    if (sheets.length === 0) {
        sheets.push({
            sheet: '打卡明細',
            data: [title(`${STORE}　${monthTitle(month)}　打卡明細`, 4), note('這個月份沒有完整的打卡紀錄。', 4)],
            columns: [{ width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }]
        });
    }
    return sheets;
};

exports.payrollBuffer = (report, month) => writeExcelFile(exports.payrollSheets(report, month)).toBuffer();
exports.detailBuffer = (report, month) => writeExcelFile(exports.detailSheets(report, month)).toBuffer();
exports.fileNames = (month) => ({
    payroll: `應發薪資_${month}.xlsx`,
    details: `每人打卡明細_${month}.xlsx`
});
