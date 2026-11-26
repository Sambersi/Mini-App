'use strict';

const express = require('express');

function createPlainFrontendRouter(frontendPath) {
  const router = express.Router();
  router.use(express.static(frontendPath, {
    setHeaders(res, filePath) {
      // HTML/script ordering must survive CDN optimization and WebView caching.
      if (/\.(html|css|js)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache, no-transform');
      }
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }));
  // A missing CSS/JS file must never become the React SPA's index.html.
  router.use((req, res) => {
    res.status(404).json({ error: 'Mini App resource not found' });
  });
  return router;
}

module.exports = { createPlainFrontendRouter };
