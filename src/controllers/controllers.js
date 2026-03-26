const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const podCtrl = {
  list: async (req, res, next) => {
    try {
      const pods = await prisma.pod.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
      const totalSaved  = pods.reduce((s, p) => s + p.currentAmount, 0);
      const totalTarget = pods.reduce((s, p) => s + p.targetAmount, 0);
      res.json({ pods, totalSaved, totalTarget });
    } catch (err) { next(err); }
  },

  create: async (req, res, next) => {
    try {
      const { name, emoji, color, targetAmount, deadline, autoContribute } = req.body;
      if (!name || !targetAmount) return res.status(400).json({ error: 'name and targetAmount required' });
      const pod = await prisma.pod.create({
        data: {
          userId: req.user.id, name,
          emoji: emoji || '🫙', color: color || '#00D4FF',
          targetAmount: Number(targetAmount),
          deadline: deadline ? new Date(deadline) : null,
          autoContribute: autoContribute ? Number(autoContribute) : null,
        }
      });
      await prisma.user.update({ where: { id: req.user.id }, data: { xp: { increment: 20 } } });
      res.status(201).json(pod);
    } catch (err) { next(err); }
  },

  deposit: async (req, res, next) => {
    try {
      const { amount } = req.body;
      const pod = await prisma.pod.findFirst({ where: { id: req.params.id, userId: req.user.id } });
      if (!pod) return res.status(404).json({ error: 'Pod not found' });

      const newAmount   = pod.currentAmount + Number(amount);
      const isCompleted = newAmount >= pod.targetAmount;

      const updatedPod = await prisma.pod.update({
        where: { id: pod.id },
        data: { currentAmount: newAmount, isCompleted, completedAt: isCompleted && !pod.isCompleted ? new Date() : pod.completedAt }
      });

      await Promise.all([
        prisma.transaction.create({
          data: { userId: req.user.id, amount: Number(amount), type: 'POD_DEPOSIT', category: 'Savings', description: `Deposit → ${pod.name}` }
        }),
        prisma.user.update({ where: { id: req.user.id }, data: { totalSaved: { increment: Number(amount) }, xp: { increment: 10 } } })
      ]);

      if (isCompleted && !pod.isCompleted) {
        const badge = await prisma.badge.findUnique({ where: { key: 'pod_champion' } });
        if (badge) {
          await prisma.userBadge.upsert({
            where: { userId_badgeId: { userId: req.user.id, badgeId: badge.id } },
            update: {}, create: { userId: req.user.id, badgeId: badge.id }
          });
        }
      }
      res.json({ pod: updatedPod, completed: isCompleted });
    } catch (err) { next(err); }
  },

  withdraw: async (req, res, next) => {
    try {
      const { amount } = req.body;
      const pod = await prisma.pod.findFirst({ where: { id: req.params.id, userId: req.user.id } });
      if (!pod) return res.status(404).json({ error: 'Pod not found' });
      if (Number(amount) > pod.currentAmount) return res.status(400).json({ error: 'Amount exceeds pod balance' });
      const updatedPod = await prisma.pod.update({ where: { id: pod.id }, data: { currentAmount: { decrement: Number(amount) } } });
      await prisma.user.update({ where: { id: req.user.id }, data: { totalSaved: { decrement: Number(amount) } } });
      res.json(updatedPod);
    } catch (err) { next(err); }
  },


  update: async (req, res, next) => {
    try {
      const { name, color, targetAmount, deadline, autoContribute } = req.body;
      const pod = await prisma.pod.findFirst({ where: { id: req.params.id, userId: req.user.id } });
      if (!pod) return res.status(404).json({ error: 'Pod not found' });
      const updated = await prisma.pod.update({
        where: { id: pod.id },
        data: {
          ...(name           !== undefined && { name }),
          ...(color          !== undefined && { color }),
          ...(targetAmount   !== undefined && { targetAmount: Number(targetAmount) }),
          ...(deadline       !== undefined && { deadline: deadline ? new Date(deadline) : null }),
          ...(autoContribute !== undefined && { autoContribute: Number(autoContribute) }),
        }
      });
      res.json(updated);
    } catch (err) { next(err); }
  },
  remove: async (req, res, next) => {
    try {
      await prisma.pod.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
      res.json({ message: 'Pod deleted' });
    } catch (err) { next(err); }
  }
};

const budgetCtrl = {
  list: async (req, res, next) => {
    try {
      const now = new Date();
      const { month = now.getMonth() + 1, year = now.getFullYear() } = req.query;
      const budgets = await prisma.budget.findMany({ where: { userId: req.user.id, month: Number(month), year: Number(year) } });
      const totalLimit = budgets.reduce((s, b) => s + b.limit, 0);
      const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
      res.json({ budgets, totalLimit, totalSpent });
    } catch (err) { next(err); }
  },

  upsert: async (req, res, next) => {
    try {
      const { category, emoji, limit, month, year } = req.body;
      const now = new Date();
      const budget = await prisma.budget.upsert({
        where: { userId_category_month_year: { userId: req.user.id, category, month: month || now.getMonth() + 1, year: year || now.getFullYear() } },
        update: { limit: Number(limit), emoji: emoji || '💳' },
        create: { userId: req.user.id, category, emoji: emoji || '💳', limit: Number(limit), month: month || now.getMonth() + 1, year: year || now.getFullYear() }
      });
      res.status(201).json(budget);
    } catch (err) { next(err); }
  },

  remove: async (req, res, next) => {
    try {
      await prisma.budget.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
      res.json({ message: 'Budget deleted' });
    } catch (err) { next(err); }
  }
};

const investCtrl = {
  list: async (req, res, next) => {
    try {
      const investments = await prisma.investment.findMany({ where: { userId: req.user.id } });
      const portfolio = investments.map(inv => {
        const value    = inv.shares * inv.currentPrice;
        const cost     = inv.shares * inv.avgPrice;
        const gainLoss = value - cost;
        const gainPct  = cost > 0 ? (gainLoss / cost) * 100 : 0;
        return { ...inv, value, cost, gainLoss, gainPct };
      });
      const totalValue    = portfolio.reduce((s, i) => s + i.value, 0);
      const totalCost     = portfolio.reduce((s, i) => s + i.cost, 0);
      const totalGainLoss = totalValue - totalCost;
      const totalGainPct  = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
      res.json({ portfolio, totalValue, totalCost, totalGainLoss, totalGainPct });
    } catch (err) { next(err); }
  },

  add: async (req, res, next) => {
    try {
      const { name, ticker, type, shares, avgPrice, currentPrice, logoUrl } = req.body;
      const inv = await prisma.investment.create({
        data: { userId: req.user.id, name, ticker: ticker.toUpperCase(), type, shares: Number(shares), avgPrice: Number(avgPrice), currentPrice: Number(currentPrice), logoUrl }
      });
      await prisma.user.update({ where: { id: req.user.id }, data: { totalInvested: { increment: Number(shares) * Number(avgPrice) }, xp: { increment: 25 } } });
      res.status(201).json(inv);
    } catch (err) { next(err); }
  },

  remove: async (req, res, next) => {
    try {
      await prisma.investment.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
      res.json({ message: 'Investment removed' });
    } catch (err) { next(err); }
  }
};

const gamCtrl = {
  profile: async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { badges: { include: { badge: true }, orderBy: { earnedAt: 'desc' } } }
      });
      const xpForNext = user.level * 500;
      const xpInLevel = user.xp % 500;
      const progress  = Math.round((xpInLevel / 500) * 100);
      const { password, ...safe } = user;
      res.json({ ...safe, xpForNext, xpInLevel, progress });
    } catch (err) { next(err); }
  },

  badges: async (req, res, next) => {
    try {
      const [all, earned] = await Promise.all([
        prisma.badge.findMany({ orderBy: { rarity: 'asc' } }),
        prisma.userBadge.findMany({ where: { userId: req.user.id }, include: { badge: true } })
      ]);
      const earnedIds = new Set(earned.map(e => e.badgeId));
      res.json(all.map(b => ({ ...b, earned: earnedIds.has(b.id), earnedAt: earned.find(e => e.badgeId === b.id)?.earnedAt || null })));
    } catch (err) { next(err); }
  }
};

const userCtrl = {
  me: async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      const { password, ...safe } = user;
      res.json(safe);
    } catch (err) { next(err); }
  },

  update: async (req, res, next) => {
    try {
      const { firstName, lastName, bio, avatar, currency, roundUpEnabled, roundUpMultiplier } = req.body;
      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: {
          ...(firstName !== undefined && { firstName }),
          ...(lastName !== undefined && { lastName }),
          ...(bio !== undefined && { bio }),
          ...(avatar !== undefined && { avatar }),
          ...(currency !== undefined && { currency }),
          ...(roundUpEnabled !== undefined && { roundUpEnabled }),
          ...(roundUpMultiplier !== undefined && { roundUpMultiplier: Number(roundUpMultiplier) }),
        }
      });
      const { password, ...safe } = user;
      res.json(safe);
    } catch (err) { next(err); }
  }
};

const notifCtrl = {
  list: async (req, res, next) => {
    try {
      const notifications = await prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 30 });
      const unread = notifications.filter(n => !n.isRead).length;
      res.json({ notifications, unread });
    } catch (err) { next(err); }
  },

  markRead: async (req, res, next) => {
    try {
      await prisma.notification.updateMany({ where: { userId: req.user.id, isRead: false }, data: { isRead: true } });
      res.json({ message: 'All marked as read' });
    } catch (err) { next(err); }
  }
};

const dashCtrl = {
  summary: async (req, res, next) => {
    try {
      const now          = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [user, txStats, pods, budgets, investments, recentTx] = await Promise.all([
        prisma.user.findUnique({ where: { id: req.user.id } }),
        prisma.transaction.groupBy({ by: ['type'], where: { userId: req.user.id, date: { gte: startOfMonth } }, _sum: { amount: true } }),
        prisma.pod.findMany({ where: { userId: req.user.id }, orderBy: { updatedAt: 'desc' }, take: 3 }),
        prisma.budget.findMany({ where: { userId: req.user.id, month: now.getMonth() + 1, year: now.getFullYear() } }),
        prisma.investment.findMany({ where: { userId: req.user.id } }),
        prisma.transaction.findMany({ where: { userId: req.user.id }, orderBy: { date: 'desc' }, take: 5 })
      ]);

      const income         = txStats.find(t => t.type === 'INCOME')?._sum?.amount  || 0;
      const expenses       = txStats.find(t => t.type === 'EXPENSE')?._sum?.amount || 0;
      const roundUps       = txStats.find(t => t.type === 'ROUND_UP')?._sum?.amount || 0;
      const portfolioValue = investments.reduce((s, i) => s + (i.shares * i.currentPrice), 0);
      const { password, ...safeUser } = user;

      res.json({
        user: safeUser,
        month: { income, expenses, savings: income - expenses, roundUps },
        pods: pods.map(p => ({ ...p, progress: p.targetAmount > 0 ? (p.currentAmount / p.targetAmount * 100).toFixed(1) : 0 })),
        budgets: { items: budgets, totalLimit: budgets.reduce((s, b) => s + b.limit, 0), totalSpent: budgets.reduce((s, b) => s + b.spent, 0) },
        portfolio: { value: portfolioValue, count: investments.length },
        recentTransactions: recentTx
      });
    } catch (err) { next(err); }
  }
};

module.exports = { podCtrl, budgetCtrl, investCtrl, gamCtrl, userCtrl, notifCtrl, dashCtrl };
