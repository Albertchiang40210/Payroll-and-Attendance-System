const { PrismaClient } = require('@prisma/client');

// 整個程式共用一個 PrismaClient（一組連線池），避免每個檔案各開一組而耗盡資料庫連線
const prisma = global.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;

module.exports = prisma;
