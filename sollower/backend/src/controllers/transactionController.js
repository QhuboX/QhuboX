// backend/src/controllers/transactionController.js
const { getTransactionService } = require('../services/transactionService');

exports.sendAdReward = async (req, res) => {
  try {
    const { recipientPublicKey, amount, adId } = req.body;
    if (!recipientPublicKey || !amount || !adId)
      return res.status(400).json({ success: false, error: 'Missing: recipientPublicKey, amount, adId' });
    const min = parseFloat(process.env.MIN_AD_REWARD_PER_VIEW || '0.001');
    if (parseFloat(amount) < min)
      return res.status(400).json({ success: false, error: `Min reward is $${min} USD` });
    const result = await getTransactionService().sendAdReward(recipientPublicKey, parseFloat(amount), adId);
    res.json(result);
  } catch (e) {
    console.error('sendAdReward error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { signature, expectedAmount, expectedRecipient } = req.body;
    if (!signature || !expectedAmount || !expectedRecipient)
      return res.status(400).json({ success: false, error: 'Missing fields' });
    const result = await getTransactionService().verifyPayment(signature, parseFloat(expectedAmount), expectedRecipient);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

exports.getPlatformBalance = async (_req, res) => {
  try {
    res.json(await getTransactionService().getPlatformBalance());
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

exports.getUserBalance = async (req, res) => {
  try {
    const { address } = req.params;
    if (!address) return res.status(400).json({ success: false, error: 'Address required' });
    res.json(await getTransactionService().getUserBalance(address));
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

exports.chargePublicationFee = async (req, res) => {
  // The fee is charged on the frontend via wallet signing
  // Backend only confirms/logs
  const { userPublicKey, postType } = req.body;
  const fees = {
    personal: 0,
    sale: parseFloat(process.env.PUBLICATION_FEE_SALE || '10'),
    fund: parseFloat(process.env.PUBLICATION_FEE_FUNDRAISING || '10'),
    ad: parseFloat(process.env.PUBLICATION_FEE_AD || '10'),
  };
  res.json({ success: true, feeUSD: fees[postType] ?? 0, message: 'Fee charged via frontend wallet' });
};

exports.batchSendRewards = async (req, res) => {
  try {
    const { rewards } = req.body;
    if (!Array.isArray(rewards) || rewards.length === 0)
      return res.status(400).json({ success: false, error: 'rewards array required' });
    const svc = getTransactionService();
    const results = [], errors = [];
    for (const r of rewards) {
      try {
        results.push(await svc.sendAdReward(r.recipientPublicKey, r.amount, r.adId));
      } catch (e) {
        errors.push({ recipientPublicKey: r.recipientPublicKey, error: e.message });
      }
    }
    res.json({ success: true, processed: results.length, failed: errors.length, results, errors });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

exports.prepareDirectTransfer = async (req, res) => {
  res.json({ success: true, message: 'Direct transfers are handled on the frontend via wallet signing' });
};

exports.getFeesInfo = async (_req, res) => {
  res.json({
    success: true,
    currency: 'USD (converted to QHUBX at market rate)',
    network: process.env.SOLANA_NETWORK || 'devnet',
    fees: {
      personal: parseFloat(process.env.PUBLICATION_FEE_PERSONAL || '0'),
      sale: parseFloat(process.env.PUBLICATION_FEE_SALE || '10'),
      fundraising: parseFloat(process.env.PUBLICATION_FEE_FUNDRAISING || '10'),
      ad: parseFloat(process.env.PUBLICATION_FEE_AD || '10'),
      minAdRewardPerView: parseFloat(process.env.MIN_AD_REWARD_PER_VIEW || '0.001'),
      minAdBudget: parseFloat(process.env.MIN_AD_REWARD_BUDGET || '1.00'),
    },
  });
};
