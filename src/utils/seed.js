require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding Dripfund...\n');

  const badges = [
    { key: 'first_drop',   name: 'First Drop',       emoji: 'drop',    description: 'Welcome to Dripfund!',      xpReward: 50,  rarity: 'COMMON' },
    { key: 'streak_7',     name: 'Streak Master',     emoji: 'bolt',    description: '7-day login streak',        xpReward: 150, rarity: 'RARE' },
    { key: 'streak_30',    name: 'Legendary Streak',  emoji: 'wave',    description: '30-day login streak',       xpReward: 500, rarity: 'LEGENDARY' },
    { key: 'first_tx',     name: 'First Transaction', emoji: 'card',    description: 'Logged your first spend',   xpReward: 25,  rarity: 'COMMON' },
    { key: 'tx_50',        name: 'Transaction King',  emoji: 'crown',   description: '50 transactions logged',    xpReward: 100, rarity: 'RARE' },
    { key: 'pod_champion', name: 'Pod Champion',      emoji: 'trophy',  description: 'Completed a savings pod',  xpReward: 200, rarity: 'RARE' },
    { key: 'pod_creator',  name: 'Pod Creator',       emoji: 'savings', description: 'Created 3 savings pods',   xpReward: 75,  rarity: 'COMMON' },
    { key: 'saver_100',    name: 'First Hundo',       emoji: 'star',    description: 'Saved your first $100',    xpReward: 100, rarity: 'COMMON' },
    { key: 'saver_1000',   name: 'Big Saver',         emoji: 'money',   description: 'Saved over $1,000',        xpReward: 250, rarity: 'EPIC' },
    { key: 'investor',     name: 'Investor',          emoji: 'chart',   description: 'Added first investment',   xpReward: 100, rarity: 'RARE' },
    { key: 'budget_boss',  name: 'Budget Boss',       emoji: 'pie',     description: 'Stayed under budget',      xpReward: 150, rarity: 'RARE' },
    { key: 'level_5',      name: 'Level Up',          emoji: 'rocket',  description: 'Reached Level 5',          xpReward: 250, rarity: 'EPIC' },
    { key: 'level_10',     name: 'Drip God',          emoji: 'star2',   description: 'Reached Level 10',         xpReward: 500, rarity: 'LEGENDARY' },
    { key: 'round_up_100', name: 'Drip Collector',    emoji: 'bubble',  description: '$100 in round-ups',        xpReward: 150, rarity: 'RARE' },
  ];

  for (const b of badges) {
    await prisma.badge.upsert({ where: { key: b.key }, update: {}, create: b });
  }
  console.log(`${badges.length} badges seeded`);

  const pw   = await bcrypt.hash('Demo1234!', 12);
  const user = await prisma.user.upsert({
    where: { email: 'demo@dripfund.app' },
    update: {},
    create: {
      email: 'demo@dripfund.app',
      password: pw,
      username: 'dripmaster',
      firstName: 'Alex',
      lastName: 'Chen',
      xp: 840, level: 3, streak: 7, longestStreak: 14,
      totalSaved: 1240.50, totalInvested: 3500,
      lastLoginAt: new Date(),
    }
  });
  console.log('Demo user ready');

  // Delete existing data to re-seed clean
  await prisma.pod.deleteMany({ where: { userId: user.id } });
  await prisma.investment.deleteMany({ where: { userId: user.id } });

  await prisma.pod.createMany({ data: [
    { userId: user.id, name: 'Tokyo Trip',    emoji: 'travel',  color: '#FF6B6B', targetAmount: 3000, currentAmount: 920 },
    { userId: user.id, name: 'MacBook Pro',   emoji: 'tech',    color: '#7B61FF', targetAmount: 2500, currentAmount: 780 },
    { userId: user.id, name: 'Emergency Fund',emoji: 'safety',  color: '#00FFB3', targetAmount: 5000, currentAmount: 2100 },
    { userId: user.id, name: 'New Sneakers',  emoji: 'fashion', color: '#FFB347', targetAmount: 300,  currentAmount: 300, isCompleted: true },
  ]});
  console.log('4 pods seeded');

  const txCount = await prisma.transaction.count({ where: { userId: user.id } });
  if (txCount === 0) {
    const categories = ['Food','Transport','Shopping','Entertainment','Bills','Health'];
    const merchants  = ['Starbucks','Uber','Amazon','Netflix','Apple','Spotify','Gym'];
    const txData = [];
    for (let i = 0; i < 30; i++) {
      const daysAgo = Math.floor(Math.random() * 30);
      txData.push({
        userId: user.id,
        amount: parseFloat((Math.random() * 90 + 5).toFixed(2)),
        type: 'EXPENSE',
        category: categories[Math.floor(Math.random() * categories.length)],
        description: `Purchase at ${merchants[Math.floor(Math.random() * merchants.length)]}`,
        merchant: merchants[Math.floor(Math.random() * merchants.length)],
        date: new Date(Date.now() - daysAgo * 86400000),
      });
    }
    txData.push({ userId: user.id, amount: 4200, type: 'INCOME', category: 'Salary',    description: 'Monthly salary',    date: new Date() });
    txData.push({ userId: user.id, amount: 650,  type: 'INCOME', category: 'Freelance', description: 'Freelance project', date: new Date() });
    await prisma.transaction.createMany({ data: txData });
    console.log(`${txData.length} transactions seeded`);
  }

  await prisma.investment.createMany({ data: [
    { userId: user.id, name: 'Apple Inc.',       ticker: 'AAPL', type: 'STOCK',      shares: 5,    avgPrice: 172,   currentPrice: 188.50 },
    { userId: user.id, name: 'Vanguard S&P 500', ticker: 'VOO',  type: 'INDEX_FUND', shares: 3,    avgPrice: 415,   currentPrice: 448.20 },
    { userId: user.id, name: 'Bitcoin',          ticker: 'BTC',  type: 'CRYPTO',     shares: 0.08, avgPrice: 38000, currentPrice: 66800  },
    { userId: user.id, name: 'Tesla',            ticker: 'TSLA', type: 'STOCK',      shares: 4,    avgPrice: 240,   currentPrice: 185.20 },
  ]});
  console.log('4 investments seeded');

  const now = new Date();
  const budgets = [
    { category: 'Food',          emoji: 'food',    limit: 400, spent: 285 },
    { category: 'Transport',     emoji: 'car',     limit: 150, spent: 88  },
    { category: 'Entertainment', emoji: 'gaming',  limit: 100, spent: 112 },
    { category: 'Shopping',      emoji: 'shop',    limit: 200, spent: 145 },
    { category: 'Health',        emoji: 'health',  limit: 80,  spent: 45  },
  ];
  for (const b of budgets) {
    await prisma.budget.upsert({
      where: { userId_category_month_year: { userId: user.id, category: b.category, month: now.getMonth() + 1, year: now.getFullYear() } },
      update: {},
      create: { userId: user.id, ...b, month: now.getMonth() + 1, year: now.getFullYear() }
    });
  }
  console.log(`${budgets.length} budgets seeded`);

  const badgeKeys = ['first_drop','streak_7','first_tx','pod_creator','saver_1000','investor'];
  for (const key of badgeKeys) {
    const badge = await prisma.badge.findUnique({ where: { key } });
    if (badge) {
      await prisma.userBadge.upsert({
        where: { userId_badgeId: { userId: user.id, badgeId: badge.id } },
        update: {},
        create: { userId: user.id, badgeId: badge.id }
      });
    }
  }
  console.log(`${badgeKeys.length} badges awarded`);

  console.log('\nSeed complete!');
  console.log('demo@dripfund.app / Demo1234!\n');
}

seed()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
