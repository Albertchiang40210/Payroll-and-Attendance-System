const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
require('dotenv').config();

const port = process.env.PORT || 3001;

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: '點心店員工出勤與薪資系統 API',
            version: '1.0.0',
            description: '員工打卡、排班、請假與勞基法加班費薪資結算 API（JWT 驗證 + 角色權限）。',
        },
        servers: [
            {
                url: `http://localhost:${port}`,
                description: 'API 伺服器',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        security: [{ bearerAuth: [] }],
        paths: {
            '/api/employees': {
                get: {
                    summary: '取得所有員工列表',
                    tags: ['員工管理'],
                    responses: {
                        200: { description: '成功取得所有員工的基本資料與時薪' }
                    }
                },
                post: {
                    summary: '人事管理：大老闆新增員工資料',
                    tags: ['員工管理'],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['username', 'password', 'name', 'hourly_rate'],
                                    properties: {
                                        username: { type: 'string', example: 'jay' },
                                        password: { type: 'string', example: 'secret123' },
                                        name: { type: 'string', example: '周杰倫' },
                                        hourly_rate: { type: 'integer', example: 185 }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: '成功新增員工' }
                    }
                }
            },
            '/api/employees/{id}': {
                put: {
                    summary: '人事管理：修改員工姓名或時薪',
                    tags: ['員工管理'],
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: '員工的 emp_id' }
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        name: { type: 'string', example: '王大明' },
                                        hourly_rate: { type: 'integer', example: 200 }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: '員工資料修改成功' }
                    }
                },
                delete: {
                    summary: '人事管理：刪除員工資料',
                    tags: ['員工管理'],
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: '員工的 emp_id' }
                    ],
                    responses: {
                        200: { description: '員工已成功刪除' }
                    }
                }
            },
            '/api/clock': {
                post: {
                    summary: '員工上下班打卡功能 (內建重複打卡與班次防呆)',
                    tags: ['出勤管理'],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['emp_id', 'type'],
                                    properties: {
                                        emp_id: { type: 'integer', example: 1 },
                                        type: { type: 'string', enum: ['in', 'out'], example: 'in' },
                                        punch_type: { type: 'string', enum: ['正常', '加班'], example: '正常' }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: '打卡成功' },
                        400: { description: '資料不完整或重複打卡提示' },
                        500: { description: '資料庫錯誤' }
                    }
                }
            },
            '/api/attendance/today': {
                get: {
                    summary: '取得今日所有員工的出勤流水帳 (即時動態)',
                    tags: ['出勤管理'],
                    responses: {
                        200: { description: '成功取得今日出勤報表' }
                    }
                }
            },
            '/api/salary': {
                get: {
                    summary: '整月份薪資自動結算 + 詳細出勤紀錄查詢',
                    tags: ['薪資結算'],
                    parameters: [
                        { name: 'month', in: 'query', required: true, schema: { type: 'string' }, description: '欲查詢的月份，格式：2026-06', example: '2026-06' }
                    ],
                    responses: {
                        200: { description: '成功取得該月薪資加總摘要及每日出勤時數明細' }
                    }
                }
            }
        }
    },
    apis: [], 
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

module.exports = {
    swaggerUi,
    swaggerSpec
};
