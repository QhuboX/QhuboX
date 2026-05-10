// backend/src/routes/transactionRoutes.js
const r = require('express').Router();
const c = require('../controllers/transactionController');
r.post('/charge-fee', c.chargePublicationFee);
r.post('/send-reward', c.sendAdReward);
r.post('/batch-rewards', c.batchSendRewards);
r.post('/verify-payment', c.verifyPayment);
r.post('/prepare-transfer', c.prepareDirectTransfer);
r.get('/platform-balance', c.getPlatformBalance);
r.get('/user-balance/:address', c.getUserBalance);
r.get('/fees', c.getFeesInfo);
module.exports = r;
