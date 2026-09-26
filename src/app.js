'use strict';

const express = require('express');
const routes = require('./routes');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(routes);

  // JSON 解析失败（非法 JSON 等）统一结构化错误
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({
        error: 'invalid_json',
        message: '请求体不是合法的 JSON',
      });
    }
    return next(err);
  });

  return app;
}

module.exports = { createApp };
