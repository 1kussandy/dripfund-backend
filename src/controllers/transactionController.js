const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 25, type, category, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = {
      userId: req.user.id,
      ...(type && { type }),
      ...(category && { category }),
      ...(search && { description: { contains: search, mode: 'insensitive' } }),
    };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({ where, skip, take: Number(limit), orderBy: { date: 'desc' } }),
      prisma.transaction.count({ where })
    ]);

    res.json({ transactions, meta: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) } });
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const { amount, type, category, description, merchant, note, date } = req.body;
    if (!amount || !type || !category || !description)
      return res.status(400).json({ error: 'amount, type, category and description are required' });

    const tx = await prisma.transaction.create({
      data: {
        userId: req.user.id,
        amount: Math.abs(Number(amount)),
        type, category, description, merchant, note,
        date: date ? new Date(date) : new Date(),
      }
    });

    if (type === 'EXPENSE' && req.user.roundUpEnabled) {
      const base    = Math.abs(Number(amount));
      const roundUp = parseFloat(((Math.ceil(base) - base) * req.user.roundUpMultiplier).toFixed(2));

      if (roundUp > 0) {
        await prisma.transaction.create({
          data: {
            userId: req.user.id,
            amount: roundUp,
            type: 'ROUND_UP',
            category: 'Round-Up',
            description: `Round-up from: ${description}`,
          }
        });
        await prisma.user.update({
          where: { id: req.user.id },
          data: { totalSaved: { increment: roundUp } }
        });
      }
    }

    if (type === 'EXPENSE') {
      const now = new Date();
      await prisma.budget.updateMany({
        where: { userId: req.user.id, category, month: now.getMonth() + 1, year: now.getFullYear() },
        data: { spent: { increment: Math.abs(Number(amount)) } }
      });
    }

    await prisma.user.update({ where: { id: req.user.id }, data: { xp: { increment: 5 } } });

    res.status(201).json({ transaction: tx });
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const tx = await prisma.transaction.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    await prisma.transaction.delete({ where: { id: tx.id } });
    res.json({ message: 'Transaction deleted' });
  } catch (err) { next(err); }
};

const stats = async (req, res, next) => {
  try {
    const now          = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [monthExpenses, monthIncome, categoryBreakdown, roundUpTotal] = await Promise.all([
      prisma.transaction.aggregate({
        where: { userId: req.user.id, type: 'EXPENSE', date: { gte: startOfMonth } },
        _sum: { amount: true }
      }),
      prisma.transaction.aggregate({
        where: { userId: req.user.id, type: 'INCOME', date: { gte: startOfMonth } },
        _sum: { amount: true }
      }),
      prisma.transaction.groupBy({
        by: ['category'],
        where: { userId: req.user.id, type: 'EXPENSE', date: { gte: startOfMonth } },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 6
      }),
      prisma.transaction.aggregate({
        where: { userId: req.user.id, type: 'ROUND_UP' },
        _sum: { amount: true }
      })
    ]);

    const income   = monthIncome._sum.amount   || 0;
    const expenses = monthExpenses._sum.amount || 0;

    res.json({
      month: {
        income, expenses,
        savings: income - expenses,
        savingsRate: income > 0 ? ((income - expenses) / income * 100).toFixed(1) : 0,
      },
      categoryBreakdown: categoryBreakdown.map(c => ({
        category: c.category, amount: c._sum.amount
      })),
      roundUpTotal: roundUpTotal._sum.amount || 0,
    });
  } catch (err) { next(err); }
};


const update = async (req, res, next) => {
  try {
    const tx = await prisma.transaction.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    const { amount, type, category, description, merchant, note } = req.body;
    const updated = await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        ...(amount      !== undefined && { amount: Math.abs(Number(amount)) }),
        ...(type        !== undefined && { type }),
        ...(category    !== undefined && { category }),
        ...(description !== undefined && { description }),
        ...(merchant    !== undefined && { merchant }),
        ...(note        !== undefined && { note }),
      }
    });
    res.json({ transaction: updated });
  } catch (err) { next(err); }
};

module.exports = { list, create, remove, update, stats };
