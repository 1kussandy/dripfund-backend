const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const { snapshot, chat } = require('../controllers/aiController');

router.use(authenticate);
router.get('/snapshot', snapshot);
router.post('/chat',    chat);

module.exports = router;
