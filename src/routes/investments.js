const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const { investCtrl } = require('../controllers/controllers');

router.use(authenticate);
router.get('/',       investCtrl.list);
router.post('/',      investCtrl.add);
router.delete('/:id', investCtrl.remove);

module.exports = router;
