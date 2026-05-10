// backend/src/routes/productRoutes.js
const r = require('express').Router();
const c = require('../controllers/productController');
r.post('/purchase/verify', c.verifyPayment);
module.exports = r;
