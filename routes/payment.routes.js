const express = require("express");
const router = express.Router();
const {
  createOrder,
  verifyPayment,
} = require("../controllers/payment.controller");

router.post("/createorder", createOrder);
router.post("/verifypayment", verifyPayment);

module.exports = router;
