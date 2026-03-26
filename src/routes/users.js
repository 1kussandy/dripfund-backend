const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const { userCtrl } = require('../controllers/controllers');

router.use(authenticate);
router.get('/me',   userCtrl.me);
router.patch('/me', userCtrl.update);

module.exports = router;
