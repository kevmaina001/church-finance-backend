require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const userRoutes = require('./routes/userRoutes');
const bodyParser = require('body-parser');
const incomeRoutes = require('./routes/incomeRoutes');
const expenditureRoutes = require('./routes/expenditureRoutes');
const reportRoutes = require('./routes/reportRoutes');
const balanceRoutes = require('./routes/balanceRoutes');
const voteheadRoutes = require('./routes/voteheadRoutes');
const auditRoutes = require('./routes/auditRoutes');
const accountRoutes = require('./routes/accountRoutes');
const journalEntryRoutes = require('./routes/journalEntryRoutes');
const revenueSourceRoutes = require('./routes/revenueSourceRoutes');
const accountingRoutes = require('./routes/accountingRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const localChurchRoutes = require('./routes/localChurchRoutes');
const memberRoutes = require('./routes/memberRoutes');
const budgetRoutes = require('./routes/budgetRoutes');
const fundRoutes = require('./routes/fundRoutes');
const parishRoutes = require('./routes/parishRoutes');
const app = express();

// Behind Render's proxy: trust the first proxy so rate limiting keys on the real client IP.
app.set('trust proxy', 1);




const cors = require('cors');

app.use(cors({
    origin: ['http://localhost:3000', 'https://ackamune-fund-manager.vercel.app'],
    credentials: true,
    methods: 'GET, POST, PUT, DELETE',
    allowedHeaders: 'Content-Type, Authorization'
}));




// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


// Database Connection
connectDB();

// Health check
const mongoose = require('mongoose');
app.get('/health', (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1; // 1 = connected
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    db: dbConnected ? 'connected' : 'disconnected',
    uptime: process.uptime(),
  });
});

// Routes
app.use('/api/users', userRoutes);
app.use('/api/incomes', incomeRoutes);
app.use('/api/expenditures', expenditureRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/balance', balanceRoutes);
app.use('/api/voteheads', voteheadRoutes);

app.use('/api/audit', auditRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/journal-entries', journalEntryRoutes);
app.use('/api/revenue-sources', revenueSourceRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/local-churches', localChurchRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/funds', fundRoutes);
app.use('/api/parish', parishRoutes);




// Keep the free-tier instance from sleeping.
// Render spins a free service down after ~15 min with no inbound traffic, and the
// cold start that follows takes ~30s. To avoid that, we ping our own /health every
// 14 min so the idle timer never elapses. Render provides RENDER_EXTERNAL_URL
// automatically; SELF_URL is a manual fallback. Disabled locally (neither var set),
// so it never runs during development.
const https = require('https');
const http = require('http');

function startKeepAlive() {
  const base = (process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL || '').replace(/\/$/, '');
  if (!base) {
    console.log('Keep-alive disabled (no RENDER_EXTERNAL_URL / SELF_URL set)');
    return;
  }
  const target = `${base}/health`;
  const client = target.startsWith('https') ? https : http;
  const INTERVAL_MS = 14 * 60 * 1000; // 14 min, under Render's 15-min idle window

  setInterval(() => {
    const started = Date.now();
    client
      .get(target, (res) => {
        res.resume(); // drain the response so the socket is freed
        console.log(`[keep-alive] ${res.statusCode} from ${target} in ${Date.now() - started}ms`);
      })
      .on('error', (err) => console.error('[keep-alive] ping failed:', err.message));
  }, INTERVAL_MS);

  console.log(`Keep-alive enabled: pinging ${target} every 14 min`);
}

// Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startKeepAlive();
});
