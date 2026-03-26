const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const client = new Anthropic();

const DRIP_PERSONA = `You are Drip, the AI financial coach inside Dripfund — a Gen Z personal finance app.
Be supportive, real, and data-driven. Use natural language, keep it brief and actionable. Under 180 words.`;

const snapshot = async (req, res, next) => {
  try {
    const now          = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [user, txStats, budgets, pods] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user.id } }),
      prisma.transaction.groupBy({ by: ['category'], where: { userId: req.user.id, type: 'EXPENSE', date: { gte: startOfMonth } }, _sum: { amount: true }, orderBy: { _sum: { amount: 'desc' } }, take: 5 }),
      prisma.budget.findMany({ where: { userId: req.user.id, month: now.getMonth() + 1, year: now.getFullYear() } }),
      prisma.pod.findMany({ where: { userId: req.user.id, isCompleted: false } })
    ]);

    const totalExpenses = txStats.reduce((s, t) => s + t._sum.amount, 0);
    const overBudget    = budgets.filter(b => b.spent > b.limit);

    const prompt = `User: ${user.firstName}, Level ${user.level}, ${user.streak} day streak
Monthly spend: $${totalExpenses.toFixed(2)}
Top categories: ${txStats.map(t => `${t.category} $${t._sum.amount.toFixed(0)}`).join(', ')}
Over budget: ${overBudget.length > 0 ? overBudget.map(b => `${b.category}`).join(', ') : 'None'}
Active pods: ${pods.length}, Total saved: $${user.totalSaved.toFixed(2)}

Give a personalized monthly snapshot with: spending health score (0-100), top insight, one action step, motivational close. Under 150 words.`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 350,
      system: DRIP_PERSONA,
      messages: [{ role: 'user', content: prompt }]
    });

    res.json({ insight: message.content[0].text });
  } catch (err) { next(err); }
};

const chat = async (req, res, next) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const user     = await prisma.user.findUnique({ where: { id: req.user.id } });
    const recentTx = await prisma.transaction.findMany({ where: { userId: req.user.id }, orderBy: { date: 'desc' }, take: 8 });

    const context = `User: ${user.firstName}, Level ${user.level}, ${user.xp} XP, ${user.streak} day streak. Total saved: $${user.totalSaved.toFixed(2)}. Recent: ${recentTx.map(t => `${t.type} $${t.amount} ${t.category}`).join(' | ')}`;

    const messages = [
      ...history.slice(-10).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: `${context}\n\nUser asks: ${message}` }
    ];

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: DRIP_PERSONA,
      messages
    });

    res.json({ reply: response.content[0].text });
  } catch (err) { next(err); }
};

module.exports = { snapshot, chat };
