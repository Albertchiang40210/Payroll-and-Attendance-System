const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const qrcode = require('qrcode-generator');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const catchAsync = require('../utils/catchAsync');
const { performPunch, getRecentRecords } = require('../services/punchService');

const VERSION_KEY = 'kiosk_version';
const DEFAULT_TTL_MINUTES = 10;
const DEFAULT_MAX_USES = 3;
// 去掉容易看錯的字元（0/O、1/I），方便必要時手動輸入
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const httpError = (status, message) => {
    const error = new Error(message);
    error.statusCode = status;
    return error;
};

const getSetting = async (key) => {
    const row = await prisma.setting.findUnique({ where: { key } });
    return row ? row.value : null;
};

const setSetting = (key, value) =>
    prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });

const generateCode = () =>
    Array.from({ length: 10 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');

// 取得必須是「在職的一般員工」，管理員帳號不能由店內裝置打卡
const getActiveEmployee = async (userId) => {
    const user = await prisma.user.findFirst({
        where: { id: userId, role: 'EMPLOYEE', active: true },
        select: { id: true, name: true }
    });
    if (!user) throw httpError(404, '找不到此員工，請重新選擇。');
    return user;
};

// ---------- 員工手機（裝置 token） ----------

// 以一次性 QR Code / 通行碼換取裝置 token（需在有效期限內，且未超過使用次數）
exports.pair = catchAsync(async (req, res) => {
    const invalid = () => httpError(401, '通行碼不正確、已過期或已用完，請向店長重新索取。');

    const code = req.body.code.trim().toUpperCase();
    const row = await prisma.pairingCode.findUnique({ where: { code } });
    if (!row || row.expiresAt <= new Date() || row.uses >= row.maxUses) throw invalid();

    // 以單一條件式更新搶佔名額，避免多支手機同時掃描時超過上限
    const claimed = await prisma.pairingCode.updateMany({
        where: { id: row.id, uses: { lt: row.maxUses }, expiresAt: { gt: new Date() } },
        data: { uses: { increment: 1 } }
    });
    if (claimed.count !== 1) throw invalid();

    const version = Number(await getSetting(VERSION_KEY)) || 1;
    const token = jwt.sign({ kiosk: true, v: version }, process.env.JWT_SECRET, { expiresIn: '365d' });
    res.json({ status: 'success', token });
});

exports.listEmployees = catchAsync(async (req, res) => {
    const users = await prisma.user.findMany({
        where: { role: 'EMPLOYEE', active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
    });
    res.json(users);
});

exports.records = catchAsync(async (req, res) => {
    const user = await getActiveEmployee(Number(req.query.userId));
    res.json({ name: user.name, ...(await getRecentRecords(user.id, 14)) });
});

exports.clock = catchAsync(async (req, res) => {
    const { userId, type, punch_type } = req.body;
    const user = await getActiveEmployee(userId);
    const result = await performPunch({ userId: user.id, type, punchType: punch_type || '正常' });
    res.json({ status: 'success', time: result.time, message: `${user.name}\n${result.message}` });
});

// ---------- 老闆後台 ----------

const buildQrPayload = (req, row) => {
    // 通行碼放在網址的 # 後面：瀏覽器不會把它送到伺服器，也不會留在紀錄裡
    const url = `${req.protocol}://${req.get('host')}/#c=${row.code}`;
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const svg = qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true });
    return {
        set: true,
        code: row.code,
        url,
        qr_data_url: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
        expires_at: row.expiresAt.toISOString(),
        max_uses: row.maxUses,
        uses: row.uses
    };
};

// 目前有效（尚未過期）的 QR Code；沒有則回傳 set: false
exports.getQr = catchAsync(async (req, res) => {
    const row = await prisma.pairingCode.findFirst({
        where: { expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' }
    });
    res.json(row ? buildQrPayload(req, row) : { set: false });
});

// 產生新的一次性 QR Code：舊的 QR Code 立即作廢；已登記的手機不受影響
exports.createQr = catchAsync(async (req, res) => {
    const body = req.body || {};
    const ttl = Number(body.ttl_minutes) || DEFAULT_TTL_MINUTES;
    const maxUses = Number(body.max_uses) || DEFAULT_MAX_USES;

    await prisma.pairingCode.deleteMany();
    const row = await prisma.pairingCode.create({
        data: {
            code: generateCode(),
            expiresAt: new Date(Date.now() + ttl * 60 * 1000),
            maxUses
        }
    });
    res.json(buildQrPayload(req, row));
});

// 讓所有已登記的手機失效（員工離職、手機遺失時使用）
exports.revokeAllDevices = catchAsync(async (req, res) => {
    const version = (Number(await getSetting(VERSION_KEY)) || 1) + 1;
    await setSetting(VERSION_KEY, String(version));
    await prisma.pairingCode.deleteMany();
    res.json({ message: '已讓所有已登記的手機失效，員工需重新登記。' });
});
