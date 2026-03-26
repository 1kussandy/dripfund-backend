const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const { dashCtrl } = require('../controllers/controllers');

router.use(authenticate);
router.get('/summary', dashCtrl.summary);

module.exports = router;
