'use strict';

// HTTP 路由层：只负责请求/响应，计算逻辑全部下沉到 service。

const express = require('express');
const { validateInput } = require('./validate');
const { evaluateConsolidation } = require('./service');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.post('/consolidation/evaluate', (req, res) => {
  const body = req.body;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({
      error: 'invalid_input',
      message: '请求体必须是 JSON 对象',
      details: [{ field: 'body', constraint: 'JSON object', received: body }],
    });
  }

  const check = validateInput(body);
  if (!check.valid) {
    return res.status(400).json({
      error: 'invalid_input',
      message: '输入参数校验失败',
      details: check.details,
    });
  }

  try {
    return res.json(evaluateConsolidation(check.value));
  } catch (err) {
    return res.status(500).json({
      error: 'internal_error',
      message: err.message,
    });
  }
});

module.exports = router;
