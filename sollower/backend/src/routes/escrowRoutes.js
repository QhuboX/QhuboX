// backend/src/routes/escrowRoutes.js
const r = require('express').Router();
const c = require('../controllers/escrowController');
r.post('/release-reward', c.releaseAdReward);
r.post('/verify-deposit', c.verifyEscrowDeposit);
r.get('/balance', c.getEscrowBalance);
r.get('/user-balance/:address', c.getUserBalance);
r.get('/fees', c.getFeesInfo);
module.exports = r;
