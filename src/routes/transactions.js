const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const { list, create, remove, update, stats } = require('../controllers/transactionController');

router.use(authenticate);
router.get('/',       list);
router.post('/',      create);
router.delete('/:id', remove);
router.patch('/:id',  update);
router.get('/stats',  stats);

module.exports = router;
