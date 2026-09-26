'use strict';

const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;

const app = createApp();

if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Terzaghi consolidation service listening on :${PORT}`);
  });
}

module.exports = { app };
