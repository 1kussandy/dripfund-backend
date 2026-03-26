const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const { budgetCtrl } = require('../controllers/controllers');

router.use(authenticate);
router.get('/',       budgetCtrl.list);
router.post('/',      budgetCtrl.upsert);
router.delete('/:id', budgetCtrl.remove);

module.exports = router;
