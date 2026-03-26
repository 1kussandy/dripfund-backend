require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');

const app = express();

app.use(helmet());
app.use(compression());
app.use(cors({ origin: '*', credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));


const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'AI limit reached. You have 10 AI requests per hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const aiChatLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 20,
  message: { error: 'Daily AI chat limit reached. Come back tomorrow!' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/password',       require('./routes/forgot'));
app.use('/api/password',       require('./routes/forgot'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/transactions',  require('./routes/transactions'));
app.use('/api/pods',          require('./routes/pods'));
app.use('/api/budgets',       require('./routes/budgets'));
app.use('/api/investments',   require('./routes/investments'));
app.use('/api/gamification',  require('./routes/gamification'));
app.use('/api/ai',            aiLimiter, aiChatLimiter, require('./routes/ai'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/dashboard',     require('./routes/dashboard'));

app.get('/health', (_, res) => res.json({ status: 'ok', app: 'Dripfund API v2 💧' }));

app.use((req, res) => res.status(404).json({ error: `Route ${req.path} not found` }));

app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`\n💧 Dripfund API v2`);
  console.log(`   → http://localhost:${PORT}\n`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});

module.exports = app;
