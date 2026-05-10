// backend/src/controllers/escrowController.js
const { getEscrowService } = require('../services/escrowTransactionService');

exports.releaseAdReward = async (req, res) => {
  try {
    const { recipientPublicKey, amount, adId } = req.body;
    if (!recipientPublicKey || !amount || !adId)
      return res.status(400).json({ success: false, error: 'Missing: recipientPublicKey, amount, adId' });
    res.json(await getEscrowService().sendAdRewardFromEscrow(recipientPublicKey, parseFloat(amount), adId));
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

exports.verifyEscrowDeposit = async (req, res) => {
  try {
    const { signature, expectedAmount } = req.body;
    if (!signature || !expectedAmount)
      return res.status(400).json({ success: false, error: 'Missing: signature, expectedAmount' });
    res.json(await getEscrowService().verifyEscrowDeposit(signature, parseFloat(expectedAmount)));
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

exports.getEscrowBalance = async (_req, res) => {
  try { res.json(await getEscrowService().getEscrowBalance()); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

exports.getUserBalance = async (req, res) => {
  try {
    const { address } = req.params;
    if (!address) return res.status(400).json({ success: false, error: 'Address required' });
    res.json(await getEscrowService().getUserBalance(address));
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

exports.getFeesInfo = async (_req, res) => {
  res.json({ success: true, fees: { publicationFeeUSD: parseFloat(process.env.PUBLICATION_FEE || '10'), currency: 'USD → QHUBX' } });
};
