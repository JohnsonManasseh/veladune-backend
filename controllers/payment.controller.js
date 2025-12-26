const crypto = require("crypto");
const Booking = require("../models/booking");
const razorpay = require("../utils/razorpay");

exports.createOrder = async (req, res) => {
  try {
    const { amount, bookingId } = req.body;

    if (!amount || !bookingId) {
      return res
        .status(400)
        .json({ message: "amount and bookingId are required" });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: `booking_${bookingId}`,
    });

    booking.razorpayOrderId = order.id;
    booking.totalAmount = amount;
    booking.paymentStatus = "pending";
    await booking.save();

    res.status(200).json(order);
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { bookingId, razorpayPaymentId, razorpayOrderId, razorpaySignature } =
      req.body;

    if (
      !bookingId ||
      !razorpayPaymentId ||
      !razorpayOrderId ||
      !razorpaySignature
    ) {
      return res.status(400).json({
        message: "Missing payment verification fields",
      });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    /* ---------- VERIFY SIGNATURE ---------- */
    const body = `${razorpayOrderId}|${razorpayPaymentId}`;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      return res.status(400).json({
        message: "Payment verification failed",
      });
    }

    /* ---------- SAVE PAYMENT ---------- */
    booking.razorpayPaymentId = razorpayPaymentId;
    booking.razorpayOrderId = razorpayOrderId;
    booking.paymentStatus = "paid";
    booking.status = "confirmed";

    await booking.save();

    return res.json({
      message: "Payment verified and booking confirmed",
    });
  } catch (error) {
    console.error("Verify payment error:", error);
    return res.status(500).json({
      message: "Payment verification failed",
    });
  }
};
