const path = require('path');
const fs = require('fs');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const distDir = path.join(__dirname, 'dist');

app.use(express.json({ limit: '1mb' }));

// Allow local Expo dev server (e.g. localhost:8081) to call /api/*
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

const handlersPath = path.join(distDir, 'agent', 'serverHandlers.js');

function getHandlers() {
  if (!fs.existsSync(handlersPath)) {
    return null;
  }
  return require(handlersPath);
}

app.post('/api/regenerate', async (req, res) => {
  const handlers = getHandlers();
  if (!handlers?.handleRegenerate) {
    res.status(503).json({
      error: 'Agent server handlers not built. Run `npm run build:agent` first.',
    });
    return;
  }
  await handlers.handleRegenerate(req, res);
});

app.post('/api/test-policy', async (req, res) => {
  const handlers = getHandlers();
  if (!handlers?.handleTestPolicy) {
    res.status(503).json({
      error: 'Agent server handlers not built. Run `npm run build:agent` first.',
    });
    return;
  }
  await handlers.handleTestPolicy(req, res);
});

app.post('/api/pipeline-stream', async (req, res) => {
  const handlers = getHandlers();
  if (!handlers?.handlePipelineStream) {
    res.status(503).json({
      error: 'Agent server handlers not built. Run `npm run build:agent` first.',
    });
    return;
  }
  await handlers.handlePipelineStream(req, res);
});

app.post('/api/propose-policy', async (req, res) => {
  const handlers = getHandlers();
  if (!handlers?.handleProposePolicy) {
    res.status(503).json({
      error: 'Agent server handlers not built. Run `npm run build:agent` first.',
    });
    return;
  }
  await handlers.handleProposePolicy(req, res);
});

app.post('/api/agent-chat', async (req, res) => {
  const handlers = getHandlers();
  if (!handlers?.handleAgentChat) {
    res.status(503).json({
      error: 'Agent server handlers not built. Run `npm run build:agent` first.',
    });
    return;
  }
  await handlers.handleAgentChat(req, res);
});

app.use(express.static(distDir));

// Handle SPA routing: send all unhandled routes to index.html
app.use((_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SnappyLit web server listening on port ${PORT}`);
});
