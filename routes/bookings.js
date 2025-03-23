require("dotenv").config();
const express = require("express");
const Booking = require("../models/booking");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const Room = require("../models/rooms");
const JWT_SECRET = process.env.JWT_SECRET;

const router = express.Router();
const bcrypt = require("bcryptjs");
const twilio = require("twilio");
const client = twilio(
  "ACb6cc4abbd82df53d9a43ee6add878ebd",
  "672c9d70fb1503bc3e2cb71dfa40ec5e"
);
const nodemailer = require("nodemailer");
const { chromium } = require("playwright");
const Razorpay = require("razorpay");

// (async () => {
//   const browser = await puppeteer.launch({
//     executablePath:
//       "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", // Adjust if needed

//     headless: true,
//     args: ["--no-sandbox", "--disable-setuid-sandbox"],
//   });

//   const page = await browser.newPage();
//   await page.goto("https://example.com");
//   await browser.close();
// })();

const generateInvoicePdf = async (bookingDetails) => {
  const browser = await chromium.launch();
  ({
    headless: true, // Required for serverless environments
    args: ["--no-sandbox", "--disable-setuid-sandbox"], // Avoid permission issues
  });

  const page = await browser.newPage();

  await page.setContent(`
    <html>
      <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #333;">Booking Invoice</h2>
        <p><strong>Customer Name:</strong> ${bookingDetails.firstName} ${bookingDetails.lastName}</p>
        <p><strong>Check-in Date:</strong> ${bookingDetails.checkInDate}</p>
        <p><strong>Check-out Date:</strong> ${bookingDetails.checkOutDate}</p>
        <p><strong>Room ID:</strong> ${bookingDetails.roomId}</p>
        <p><strong>Amount:</strong> $XXX</p>
        <hr>
        <p>Thank you for booking with us!</p>
      </body>
    </html>
  `);

  const pdfBuffer = await page.pdf({ format: "A4" });

  await browser.close();
  return pdfBuffer;
};

router.post("/addbooking", async (req, res) => {
  try {
    const {
      checkInDate,
      checkOutDate,
      status,
      // userId,
      roomId,
      firstName,
      lastName,
      gender,
      email,
      phoneNumber,
      adults,
      childrens,
      infants,
      address,
    } = req.body;

    const missingFields = [];

    if (!checkInDate) missingFields.push("checkInDate");
    if (!checkOutDate) missingFields.push("checkOutDate");
    if (!status) missingFields.push("status");
    // if (!userId) missingFields.push("userId");
    if (!roomId) missingFields.push("roomId");
    if (!firstName) missingFields.push("firstName");
    if (!lastName) missingFields.push("lastName");
    if (!gender) missingFields.push("gender");
    if (!email) missingFields.push("email");
    if (!phoneNumber) missingFields.push("phoneNumber");
    if (adults === "") missingFields.push("adults");
    if (childrens === "") missingFields.push("childrens");
    if (infants === "") missingFields.push("infants");
    if (!address) missingFields.push("address");

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: `${missingFields.join(",")} is missing`,
      });
    }

    // const user = await User.findById(userId);
    // if (!user) {
    //   return res.status(400).json({ message: "User not found" });
    // }
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(400).json({ message: "Room not found" });
    }

    const checkRoomAvailable = room?.bookings?.some((b) => {
      const existingCheckInDate = new Date(b.checkInDate);
      const existingCheckOutDate = new Date(b.checkOutDate);
      const newCheckInDate = new Date(checkInDate);
      const newCheckOutDate = new Date(checkOutDate);

      return (
        (newCheckInDate >= existingCheckInDate &&
          newCheckInDate < existingCheckOutDate) ||
        (newCheckOutDate > existingCheckInDate &&
          newCheckOutDate <= existingCheckOutDate) ||
        (newCheckInDate <= existingCheckInDate &&
          newCheckOutDate >= existingCheckOutDate)
      );
    });

    // const checkRoomAvailable = room.bookings.filter(
    //   (b) => b.checkInDate === checkInDate || b.checkOutDate === checkOutDate
    // );
    if (checkRoomAvailable) {
      return res
        .status(400)
        .json({ message: "Room is not available for the selected date" });
    }

    const newBooking = new Booking({
      checkInDate,
      checkOutDate,
      // userId,
      status,
      roomId,
      firstName,
      lastName,
      gender,
      email,
      phoneNumber,
      adults,
      childrens,
      infants,
      address,
    });
    room.availability = false;
    room.bookings.push({ checkInDate, checkOutDate });
    await room.save();

    await newBooking.save();
    const pdfBuffer = await generateInvoicePdf({
      firstName,
      lastName,
      checkInDate,
      checkOutDate,
      // userId,
      roomId,
    });

    const transporter = nodemailer.createTransport({
      host: "smtpout.secureserver.net",
      port: 465,
      secure: true,
      auth: {
        user: "info@veladune.com",
        pass: "21596rocker",
      },
    });

    const mailOptions = {
      from: "info@veladune.com",
      to: email,
      subject: "Booking Confirmation - Resort Stay",
      //     html: `
      //   <h2>Booking Confirmed!</h2>
      //   <p>Dear ${firstName} ${lastName},</p>
      //   <p>We are pleased to confirm your booking at our resort.</p>
      //   <h3>Booking Details:</h3>
      //   <ul>
      //     <li><strong>Check-in Date:</strong> ${checkInDate}</li>
      //     <li><strong>Check-out Date:</strong> ${checkOutDate}</li>
      //     <li><strong>Room ID:</strong> ${roomId}</li>
      //     <li><strong>Adults:</strong> ${adults}</li>
      //     <li><strong>Children:</strong> ${childrens}</li>
      //     <li><strong>Infants:</strong> ${infants}</li>
      //     <li><strong>Address:</strong> ${address}</li>
      //   </ul>
      //   <p>We look forward to your stay!</p>
      //   <p>Thank you for choosing us.</p>
      // `,
      html: `
 <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; background-color: #fff;">
  <h2 style="color: #000; text-align: left; margin-bottom: 20px;">Booking Confirmation</h2>

  <p style="font-size: 16px; color: #000; text-align: left;">Dear <strong>${firstName} ${lastName}</strong>,</p>
  <p style="font-size: 16px; color: #000; text-align: left;">Your booking at <strong>Veladune</strong> has been confirmed. Below are the details of your stay:</p>

  <div style="background: #f9f9f9; padding: 15px; border-radius: 4px;">
    <h3 style="color: #000; text-align: left; margin-bottom: 10px;">Booking Details</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 16px; color: #000;">
      <tr>
        <td style="padding: 8px; font-weight: bold;">Check-in Date:</td>
        <td style="padding: 8px;">${checkInDate}</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold;">Check-out Date:</td>
        <td style="padding: 8px;">${checkOutDate}</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold;">Room ID:</td>
        <td style="padding: 8px;">${roomId}</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold;">Guests:</td>
        <td style="padding: 8px;">${adults} Adults, ${childrens} Children, ${infants} Infants</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold;">Address:</td>
        <td style="padding: 8px;">${address}</td>
      </tr>
    </table>
  </div>

  <h3 style="color: #000; text-align: left; margin-top: 20px;">Invoice Attached</h3>
  <p style="font-size: 16px; color: #000; text-align: left;">
    Your booking invoice is attached to this email. Please review the details and reach out if you have any questions.
  </p>

  <h3 style="color: #000; text-align: left; margin-top: 20px;">About Veladune</h3>
  <p style="font-size: 16px; color: #000; text-align: left;">
    Veladune offers a refined stay with serene surroundings and high-end amenities. We look forward to welcoming you.
  </p>

  <p style="text-align: left;">
    <a href="https://veladune.com" style="display: inline-block; padding: 10px 20px; font-size: 16px; background-color: #153D4B; color: white; text-decoration: none;">View Booking</a>
  </p>

  <h3 style="color: #000; text-align: left; margin-top: 20px;">Contact Us</h3>
  <p style="font-size: 14px; color: #000; text-align: left;">
    Kodaikanal <br>
    Email: <a href="mailto:info@veladune.com" style="color: #000;">info@veladune.com</a> <br>
    Phone: <a href="tel:+1234567890" style="color: #000;">+1 234 567 890</a>
  </p>

  <p style="font-size: 16px; color: #000; text-align: left; font-weight: bold;">Regards,<br>Johnson</p>
</div>

`,

      attachments: [
        {
          filename: "invoice.pdf",
          content: Buffer.from(pdfBuffer),
          contentType: "application/pdf",
        },
      ],
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log("Error sending email:", error);
      } else {
        console.log("Email sent:", info.response);
      }
    });

    res.status(201).json({ newBooking, message: "Your booking is reserved" });
  } catch (err) {
    console.error("Error creating booking:", err);
    res.status(500).json({ message: "Failed to create booking" });
  }
});

router.put("/updatebooking", async (req, res) => {
  try {
    const { bookingId, checkInDate, checkOutDate, action, roomId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ message: "Booking id is required" });
    }
    if (!roomId) {
      return res.status(400).json({ message: "Room id is required" });
    }
    if (!checkInDate && !checkOutDate && !action) {
      return res
        .status(400)
        .json({ message: "either check in - out date or action is required" });
    }
    if (
      (checkInDate && !checkOutDate && roomId) ||
      (!checkInDate && checkOutDate && roomId)
    ) {
      return res.status(400).json({
        message:
          "Both 'checkInDate' and 'checkOutDate' must be provided to update booking dates.",
      });
    }

    if (
      (action && checkInDate && roomId) ||
      (action && checkOutDate && roomId)
    ) {
      return res.status(400).json({
        message:
          "'action' cannot be provided with 'checkInDate' and 'checkOutDate'.",
      });
    }

    const room = await Room.findById(roomId);
    const booking = await Booking.findById(bookingId);
    if (action === "cancel") {
      room.availability = true;

      room.bookings = room.bookings.filter(
        (b) =>
          b.checkInDate.toISOString() !== booking.checkInDate.toISOString() &&
          b.checkOutDate.toISOString() !== booking.checkOutDate.toISOString()
      );
      await room.save();

      const cancelledBooking = await Booking.findByIdAndUpdate(
        bookingId,
        { status: "cancelled" },
        { new: true }
      );
      if (!cancelledBooking) {
        return res.status(400).json({ message: "Booking not found" });
      }

      return res.status(200).json({
        cancelledBooking,
        room,
        message: "Booking cancelled successfully",
      });
    }

    const checkRoomAvailable = room.bookings.some((b) => {
      const existingCheckInDate = new Date(b.checkInDate);
      const existingCheckOutDate = new Date(b.checkOutDate);
      const newCheckInDate = new Date(checkInDate);
      const newCheckOutDate = new Date(checkOutDate);

      return (
        (newCheckInDate >= existingCheckInDate &&
          newCheckInDate < existingCheckOutDate) ||
        (newCheckOutDate > existingCheckInDate &&
          newCheckOutDate <= existingCheckOutDate) ||
        (newCheckInDate <= existingCheckInDate &&
          newCheckOutDate >= existingCheckOutDate)
      );
    });
    if (checkRoomAvailable) {
      return res
        .status(400)
        .json({ message: "Room is not available for the selected date" });
    }
    room.bookings.push({ checkInDate, checkOutDate });
    await room.save();
    const updateFields = {};
    if (checkInDate) updateFields.checkInDate = checkInDate;
    if (checkOutDate) updateFields.checkOutDate = checkOutDate;

    if (Object.keys(updateFields) === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    const updatedBooking = await Booking.findByIdAndUpdate(
      bookingId,
      updateFields,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedBooking) {
      return res.status(400).json({ message: "No bookings found" });
    }

    res.status(200).json({
      message: "Bookings updated successfully",
      // booking: updatedBooking,
    });
  } catch (error) {
    console.error("Error updating booking", error);
    res.status(500).json({ message: "Failed to update booking" });
  }
});

router.get("/bookings", async (req, res) => {
  try {
    const bookings = await Booking.find();
    if (bookings.length === 0) {
      return res.status(200).json({ message: "No bookings available" });
    }
    res.status(200).json(bookings);
  } catch (err) {
    console.error("Error fetching bookings:", err);
    res.status(500).json({ message: "Failed to fetch bookings" });
  }
});

router.post("/addroom", async (req, res) => {
  try {
    const { name, availability = true, price } = req.body;

    if (!name || !price) {
      return res.status(200).json({ message: "fields should not be empty" });
    }

    const newRoom = new Room({
      name,
      availability,
      price,
    });
    await newRoom.save();
    res.status(201).json({ newRoom, message: "Room added successfully" });
  } catch (err) {
    console.error("Error adding room:", err);
    res.status(500).json({ message: "Failed to add room" });
  }
});

router.get("/rooms", async (req, res) => {
  try {
    const rooms = await Room.find();
    res.status(200).json({ message: "Rooms fetched successfully", rooms });
  } catch (error) {
    console.error("Error fetching rooms:", error);
    res.status(500).json({ message: "Failed to fetch rooms" });
  }
});

router.put("/updateroom", async (req, res) => {
  try {
    const { roomId, name, availability, price, bookings, speed } = req.body;

    const updateFields = {};
    if (name) updateFields.name = name;
    if (availability) updateFields.availability = availability;
    if (price) updateFields.price = price;
    if (bookings) updateFields.bookings = bookings;
    if (speed) updateFields.speed = speed;

    const updateRoom = await Room.findByIdAndUpdate(roomId, updateFields, {
      new: true,
      runValidators: true,
    });
    res.status(200).json({ updateRoom, message: "Rooms updated successfully" });
  } catch (error) {
    console.error("Error updating rooms:", error);
    res.status(500).json({ message: "Failed to update rooms" });
  }
});

router.post("/register", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      gender,
      address,
    } = req.body;

    if (
      !firstName ||
      !lastName ||
      !email ||
      !password ||
      !phoneNumber ||
      !gender ||
      !address
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User already exists please login" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      phoneNumber,
      gender,
      address,
    });

    await newUser.save();
    const token = jwt.sign(
      { userId: newUser._id, userName: newUser.userName },
      JWT_SECRET,
      {
        expiresIn: "1hr",
      }
    );
    res
      .status(201)
      .json({ token, userId: newUser._id, message: "Registered successfully" });
  } catch (err) {
    console.error("Error creating booking:", err);
    res
      .status(500)
      .json({ message: "Failed to register please try again later" });
  }
});

router.post("/savedetails", async (req, res) => {
  try {
    const { firstName, lastName, email, phoneNumber, gender, address } =
      req.body;

    if (
      !firstName ||
      !lastName ||
      !email ||
      !phoneNumber ||
      !gender ||
      !address
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User already exists please login" });
    }

    const newUser = new User({
      firstName,
      lastName,
      email,
      phoneNumber,
      gender,
      address,
    });

    await newUser.save();
    const token = jwt.sign(
      { userId: newUser._id, userName: newUser.userName },
      JWT_SECRET,
      {
        expiresIn: "1hr",
      }
    );
    res
      .status(201)
      .json({ token, userId: newUser._id, message: "Registered successfully" });
  } catch (err) {
    console.error("Error creating booking:", err);
    res
      .status(500)
      .json({ message: "Failed to register please try again later" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(400)
        .json({ message: "Account not found, please signup" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" });
    }

    const token = jwt.sign(
      { userId: user._id, user: user.userName },
      JWT_SECRET,
      {
        expiresIn: "1hr",
      }
    );
    res.status(201).json({
      token: token,
      userId: user._id,
      userName: user.userName,
      message: "Logged in successfully",
    });
  } catch (err) {
    console.error("Error creating booking:", err);
    res.status(500).json({ message: "Failed to login" });
  }
});

router.post("/userdetails", async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ message: "User not found" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }
    const bookings = await Booking.find({ userId: id });
    res.status(200).json({
      user,
      address: bookings.length > 0 ? bookings[0].address : null,

      bookings,
      message: "User details found",
    });
  } catch (err) {
    console.error("Error finding details", err);
    res.status(500).json({ message: "Failed to find user" });
  }
});

router.delete("/deletebooking", async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Booking id is required" });
    }

    const deleteBooking = await Booking.findByIdAndDelete(id);
    res
      .status(200)
      .json({ deleteBooking, message: "Booking deleted successfully" });
  } catch (error) {
    console.error("Error updating booking", error);
    res.status(500).json({ message: "Failed to delte booking" });
  }
});

router.put("/updateuserdetails", async (req, res) => {
  try {
    const { id, userName, email, phone } = req.body;

    if (!id) {
      return res.status(400).json({ message: "User id is required" });
    }

    const updateFields = {};
    if (userName) updateFields.userName = userName;
    if (email) updateFields.email = email;
    if (phone) updateFields.phone = phone;

    if (Object.keys(updateFields) === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    const updatedUser = await User.findByIdAndUpdate(id, updateFields, {
      new: true,
      runValidators: true,
    });

    if (!updatedUser) {
      return res.status(400).json({ message: "user not found" });
    }

    res
      .status(200)
      .json({ message: "UserDetails updated successfully", user: updatedUser });
  } catch (error) {
    console.error("Error updating user details:", error);
    res.status(500).json({ message: "Failed to update user details" });
  }
});

router.delete("/deleteuser", async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      res.status(400).json({ message: "User id is required" });
    }

    const deleteUser = await User.findByIdAndDelete(id);

    if (!deleteUser) {
      res.status(400).json({ message: "User not found" });
    }
    res.status(200).json({ message: "User deleted successfully", deleteUser });
  } catch (error) {
    console.error("Error deleting user:", err);
    res.status(500).json({ message: "Failed to delete user" });
  }
});

// const clearBookings = async (roomId) => {
//   try {
//     await Room.findByIdAndUpdate(roomId, { $set: { bookings: [] } });
//     console.log("Bookings cleared successfully");
//   } catch (error) {
//     console.error("Error clearing bookings:", error);
//   }
// };

// clearBookings("6795c21af44b32e98199cd81");

router.post("/send-otp", async (req, res) => {
  const { phoneNumber } = req.body;
  try {
    let user = await User.findOne({ phoneNumber });

    if (!user) {
      return res.status(400).send({
        error: "Oops! User not found. Sign up or fill in your details.",
      });
    }

    const verification = await client.verify
      .services("VA27352c51f42e56bb9b687b1f14eff45e")
      .verifications.create({ to: phoneNumber, channel: "sms" });
    res.status(200).send({ message: "OTP sent successfully!" });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

router.post("/verify-otp", async (req, res) => {
  const { phoneNumber, code } = req.body;
  try {
    const verificationCheck = await client.verify
      .services("VA27352c51f42e56bb9b687b1f14eff45e")
      .verificationChecks.create({ to: phoneNumber, code });

    let user = await User.findOne({ phoneNumber });

    if (verificationCheck.status === "approved") {
      const token = jwt.sign(
        { userId: user._id, phoneNumber: user.phoneNumber },
        JWT_SECRET,
        { expiresIn: "1hr" }
      );

      return res.status(200).json({
        message: "Loggedin successfully!",
        token,
        user,
      });
    } else {
      res.status(400).send({ error: "Invalid OTP" });
    }
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

const razorpay = new Razorpay({
  key_id: "rzp_test_ZlmlnOavXd7ZJ3",
  key_secret: "5qTR0TR9prVoyHHkmyFGhkVf",
});

router.post("/createorder", async (req, res) => {
  const { amount } = req.body;

  const options = {
    amount: amount * 100,
    currency: "INR",
    receipt: `receipt_${Date.now()}`,
  };

  try {
    const order = await razorpay.orders.create(options);
    res.status(200).json(order);
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
