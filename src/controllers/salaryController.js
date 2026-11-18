const catchAsync = require('../utils/catchAsync');
const { isValidMonth, buildSalaryReport } = require('../services/salaryService');
const { payrollBuffer, detailBuffer, fileNames } = require('../services/reportService');

const requireMonth = (req) => {
    const { month } = req.query;
    if (!isValidMonth(month)) {
        const error = new Error('請提供正確的查詢月份（YYYY-MM）');
        error.statusCode = 400;
        throw error;
    }
    return month;
};

exports.requireMonth = requireMonth;

exports.getSalaryReport = catchAsync(async (req, res) => {
    res.json(await buildSalaryReport(requireMonth(req)));
});

// 下載 Excel：type=payroll（應發薪資）或 type=details（每人打卡明細）
exports.exportSalary = catchAsync(async (req, res) => {
    const month = requireMonth(req);
    const { type } = req.query;
    if (type !== 'payroll' && type !== 'details') {
        const error = new Error('type 必須是 payroll 或 details');
        error.statusCode = 400;
        throw error;
    }

    const report = await buildSalaryReport(month);
    const buffer = type === 'payroll' ? await payrollBuffer(report, month) : await detailBuffer(report, month);
    const filename = fileNames(month)[type];

    res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${type}_${month}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store'
    });
    res.send(buffer);
});
