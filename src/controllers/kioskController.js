const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const qrcode = require('qrcode-generator');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const catchAsync = require('../utils/catchAsync');
const { performPunch, getRecentRecords } = require('../services/punchService');

const CODE_KEY = 'kiosk_code';
const VERSION_KEY = 'kiosk_version';
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

const safeEqual = (a, b) => {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

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

// 以 QR Code / 通行碼換取裝置 token
exports.pair = catchAsync(async (req, res) => {
    const stored = await getSetting(CODE_KEY);
    if (!stored) throw httpError(403, '老闆尚未產生打卡 QR Code，請聯絡老闆。');
    if (!safeEqual(req.body.code.trim().toUpperCase(), stored)) {
        throw httpError(401, '通行碼不正確，請重新掃描 QR Code。');
    }

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

const buildQrPayload = async (req) => {
    const code = await getSetting(CODE_KEY);
    if (!code) return { set: false };

    // 通行碼放在網址的 # 後面：瀏覽器不會把它送到伺服器，也不會留在紀錄裡
    const url = `${req.protocol}://${req.get('host')}/#c=${code}`;
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const svg = qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true });
    return {
        set: true,
        code,
        url,
        qr_data_url: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    };
};

exports.getQr = catchAsync(async (req, res) => {
    res.json(await buildQrPayload(req));
});

// 重新產生：舊的 QR Code 與所有已登記的手機立即失效
exports.regenerateQr = catchAsync(async (req, res) => {
    const version = (Number(await getSetting(VERSION_KEY)) || 1) + 1;
    await setSetting(VERSION_KEY, String(version));
    await setSetting(CODE_KEY, generateCode());
    res.json(await buildQrPayload(req));
});
