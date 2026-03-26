const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const { gamCtrl } = require('../controllers/controllers');

router.use(authenticate);
router.get('/profile', gamCtrl.profile);
router.get('/badges',  gamCtrl.badges);

module.exports = router;
