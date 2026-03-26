const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const { notifCtrl } = require('../controllers/controllers');

router.use(authenticate);
router.get('/',       notifCtrl.list);
router.post('/read',  notifCtrl.markRead);

module.exports = router;
