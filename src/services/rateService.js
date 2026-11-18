// 時薪歷史：依「日期」找出當時生效的時薪
const prisma = require('../utils/prisma');

// 沒有歷史紀錄的員工（從沒調整過時薪）一律使用目前時薪
exports.buildRateLookup = async () => {
    // 資料表很小（只有「調整過時薪」的員工才有紀錄），一次全部讀出即可
    const rows = await prisma.rateHistory.findMany({ orderBy: { effective_from: 'asc' } });
    const byUser = {};
    rows.forEach((r) => (byUser[r.userId] = byUser[r.userId] || []).push(r));

    // 回傳 (userId, 'YYYY-MM-DD', 目前時薪) => 該日生效的時薪
    return (userId, date, currentRate) => {
        const list = byUser[userId];
        if (!list) return currentRate;
        let rate = list[0].hourly_rate; // 早於第一筆生效日：用最早那筆（調整前的時薪）
        for (const r of list) {
            if (r.effective_from <= date) rate = r.hourly_rate;
            else break;
        }
        return rate;
    };
};

// 調整時薪：從 effectiveFrom 起生效。第一次調整時先補一筆「調整前的時薪」
exports.recordRateChange = async (tx, userId, oldRate, newRate, effectiveFrom) => {
    const existing = await tx.rateHistory.count({ where: { userId } });
    if (existing === 0) {
        await tx.rateHistory.create({ data: { userId, effective_from: '1970-01-01', hourly_rate: oldRate } });
    }
    await tx.rateHistory.upsert({
        where: { userId_effective_from: { userId, effective_from: effectiveFrom } },
        update: { hourly_rate: newRate },
        create: { userId, effective_from: effectiveFrom, hourly_rate: newRate }
    });
};
