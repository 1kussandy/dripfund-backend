const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const signAccess  = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
const signRefresh = (userId) => jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '30d' });

const saveRefresh = async (userId, token) => {
  await prisma.refreshToken.create({
    data: { userId, token, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
  });
};

const safeUser = (user) => {
  const { password, ...safe } = user;
  return safe;
};

const register = async (req, res, next) => {
  try {
    const { email, password, username, firstName, lastName } = req.body;

    if (!email || !password || !username || !firstName)
      return res.status(400).json({ error: 'email, password, username and firstName are required' });

    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const exists = await prisma.user.findFirst({
      where: { OR: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }] }
    });
    if (exists) return res.status(409).json({ error: 'Email or username already taken' });

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashed,
        username: username.toLowerCase(),
        firstName,
        lastName: lastName || '',
      }
    });

    const now = new Date();
    const defaultBudgets = [
      { category: 'Food',          emoji: '🍔', limit: 400 },
      { category: 'Transport',     emoji: '🚗', limit: 150 },
      { category: 'Entertainment', emoji: '🎮', limit: 100 },
    ];
    await prisma.budget.createMany({
      data: defaultBudgets.map(b => ({
        userId: user.id, ...b,
        month: now.getMonth() + 1,
        year: now.getFullYear()
      }))
    });

    const badge = await prisma.badge.findUnique({ where: { key: 'first_drop' } });
    if (badge) {
      await prisma.userBadge.create({ data: { userId: user.id, badgeId: badge.id } });
      await prisma.user.update({ where: { id: user.id }, data: { xp: { increment: badge.xpReward } } });
    }

    await prisma.notification.create({
      data: {
        userId: user.id,
        title: 'Welcome to Dripfund! 💧',
        body: `Hey ${firstName}! Your money glow-up starts now.`,
        type: 'WELCOME'
      }
    });

    const accessToken  = signAccess(user.id);
    const refreshToken = signRefresh(user.id);
    await saveRefresh(user.id, refreshToken);

    res.status(201).json({ user: safeUser(user), accessToken, refreshToken });
  } catch (err) { next(err); }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required' });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const today     = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const last      = user.lastLoginAt ? new Date(user.lastLoginAt).toDateString() : null;

    let newStreak = user.streak;
    if (last === yesterday) newStreak++;
    else if (last !== today) newStreak = 1;

    const longestStreak = Math.max(user.longestStreak, newStreak);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), streak: newStreak, longestStreak }
    });

    const accessToken  = signAccess(user.id);
    const refreshToken = signRefresh(user.id);
    await saveRefresh(user.id, refreshToken);

    res.json({ user: safeUser(updated), accessToken, refreshToken });
  } catch (err) { next(err); }
};

const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.expiresAt < new Date())
      return res.status(401).json({ error: 'Refresh token expired or invalid' });

    const decoded         = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const accessToken     = signAccess(decoded.userId);
    const newRefreshToken = signRefresh(decoded.userId);

    await prisma.refreshToken.delete({ where: { token: refreshToken } });
    await saveRefresh(decoded.userId, newRefreshToken);

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) { next(err); }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    res.json({ message: 'Logged out successfully' });
  } catch (err) { next(err); }
};

module.exports = { register, login, refresh, logout };
