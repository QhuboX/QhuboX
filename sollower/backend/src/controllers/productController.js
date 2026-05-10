// backend/src/controllers/productController.js
const { verifySolanaPayment } = require('../lib/solanaVerifier');

// In production, replace with DB lookup
const PRODUCTS = {
  'prod-example-001': { priceUSD: 9.99, secureDownloadURL: 'https://example.com/download/001' },
};

exports.verifyPayment = async (req, res) => {
  try {
    const { productId, signature, buyerAddress } = req.body;
    const product = PRODUCTS[productId];
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const ok = await verifySolanaPayment(signature, buyerAddress, product.priceUSD);
    if (!ok) return res.status(402).json({ success: false, message: 'Payment verification failed' });

    res.json({ success: true, downloadUrl: product.secureDownloadURL });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Internal error' });
  }
};
