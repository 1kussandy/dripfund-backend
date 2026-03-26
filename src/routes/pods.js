const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const { podCtrl } = require('../controllers/controllers');

router.use(authenticate);
router.get('/',              podCtrl.list);
router.post('/',             podCtrl.create);
router.delete('/:id',        podCtrl.remove);
router.patch('/:id',         podCtrl.update);
router.post('/:id/deposit',  podCtrl.deposit);
router.post('/:id/withdraw', podCtrl.withdraw);

module.exports = router;
