import express from "express";
import db from "../db/connection.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { Int32, ObjectId } from "mongodb";

const router = express.Router();
const transporter = nodemailer.createTransport({
  service: "Gmail",
  host: "smtp-relay.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.TRANSPORTER_EMAIL,
    pass: process.env.TRANSPORTER_PASSWORD,
  },
});

router.get("/", async (req, res) => {
  let collection = db.collection("students");
  let results = await collection.find({}).toArray();
  res.send(results).status(200);
});

//New Student Registration
router.post("/new", async (req, res) => {
  const { course, yearLevel, semester } = req.body;
  try {
    const collection = db.collection("students");
    const subjectCollection = db.collection("curriculums");
    const currentYear = new Date().getFullYear();
    const lastStudent = await collection
      .find(
        {
          _studentId: new RegExp(`^${currentYear}-`),
        },
        { projection: { _studentId: 1 } }
      )
      .sort({ _studentId: -1 })
      .limit(1)
      .toArray();

    let nextNumber = "0001";

    if (lastStudent) {
      const lastNumber = parseInt(lastStudent[0]._studentId.split("-")[1], 10);
      nextNumber = String(lastNumber + 1).padStart(4, "0");
    }
    const newStudentNumber = `${currentYear}-${nextNumber}`;

    const subjects = await subjectCollection.findOne({
      course,
      yearLevel,
      semester,
    });

    const newStudent = {
      _studentId: newStudentNumber,
      ...req.body,
      subjects: subjects.subjects,
      birthdate: new Date(req.body.birthdate),
      registrationDate: new Date(req.body.registrationDate),
      yearLevel: new Int32(parseInt(req.body.yearLevel)),
      createdAt: new Date(req.body.createdAt),
      updatedAt: new Date(req.body.updatedAt),
      verified: false,
    };
    let result = await collection.insertOne(newStudent);

    const token = jwt.sign(
      { userId: result.insertedId },
      process.env.SECRET_KEY,
      { expiresIn: "5m" }
    );

    const link = `${process.env.FRONTEND}/verify?token=${token}`;
    const message = await transporter.sendMail({
      from: `St Clare Online Enrollment <${process.env.TRANSPORTER_EMAIL}>`,
      to: req.body.email,
      subject: "Verify your email",
      html: `
      <html>
        <head>
          <style>
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
              
            }
            .container {
              background-color: rgba(255, 255, 255, 0.55);
              max-width: 600px;
              margin: 60px auto;
              padding: 40px 30px;
              border-radius: 12px;
              box-shadow: 0 8px 20px rgba(0,0,0,0.25);
              text-align: center;
            }
            .logo {
              width: 90px;
              height: 90px;
              border-radius: 50%;
              background-color: #fff;
              box-shadow: 0 0 8px rgba(0,0,0,0.15);
              object-fit: contain;
              margin-bottom: 20px;
            }
            h3 {
              color:rgb(0, 0, 0);
              margin-bottom: 10px;
              font-size: 24px;
            }
            p {
              color: rgb(0, 0, 0);
              font-size: 16px;
              line-height: 1.6;
              margin: 10px 0;
            }
            a.button {
              display: inline-block;
              padding: 12px 24px;
              margin-top: 20px;
              background-color: #4CAF50;
              color: #fff;
              font-weight: bold;
              text-decoration: none;
              border-radius: 6px;
              font-size: 16px;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            a.button:hover {
              background-color: #45a049;
            }
            .footer {
              margin-top: 30px;
              font-size: 12px;
              color: #888;
            }
          </style>
        </head>
        <body style="background: url('https://online-enrollment-system-admin.vercel.app/background.webp')no-repeat center center; background-size: cover;">
          <div class="container">
            <img src="https://online-enrollment-system-admin.vercel.app/icon.webp" alt="St. Clare College Logo" class="logo"/>
            <h3>Welcome to St. Clare College!</h3>
            <p>Please verify your email address by clicking the button below:</p>
            <a href="${link}" class="button">Verify Email</a>
            <p>This link will expire in 5 minutes.</p>
            <div class="footer">
              <p>If you did not request this, please ignore this message.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    });

    res
      .status(201)
      .json({ message: "A Verification link was sent to your email" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

//Verify student
router.get("/verify", async (req, res) => {
  const { token } = req.query;
  try {
    const payload = jwt.verify(token, process.env.SECRET_KEY);
    const collection = db.collection("students");
    const studentCheck = await collection.findOne({
      _id: new ObjectId(String(payload.userId)),
    });
    if (!studentCheck) {
      return res.status(404).json({ message: "Student not Found" });
    }
    await collection.findOneAndUpdate(
      { _id: new ObjectId(String(payload.userId)) },
      { $set: { verified: true } }
    );
    res.status(200).json({ message: "Verification Complete" });
  } catch (error) {
    console.error(error);
    res.status(500).json("Internal Server Error");
  }
});

//Reset Password
router.patch("/resetpassword", async (req, res) => {
  const { user, currentPassword, newPassword, confirmNewPassword } = req.body;
  if (!user || !currentPassword || !newPassword || !confirmNewPassword) {
    return res.status(404).json({ message: "Fields cannot be left empty" });
  }
  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ message: "Passwords do not match" });
  }
  const studentCollection = db.collection("students");
  const student = await studentCollection.findOne({ _studentId: user.id });
  if (!student) {
    return res.status(404).json({ message: "Student not Found" });
  }
  const passwordValidation = await bcrypt.compare(
    currentPassword,
    student.password
  );
  if (!passwordValidation) {
    return res.status(400).json({ message: "Credentials is incorrect" });
  }
  const hashPassword = await bcrypt.hash(newPassword, 10);
  try {
    const passwordUpdate = await studentCollection.updateOne(
      { _studentId: user.id },
      { $set: { password: hashPassword } }
    );
    if (passwordUpdate.matchedCount === 0) {
      return res.status(404).json({ message: "Student not Found" });
    }
    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    console.error(error);
    res.status(500);
  }
});

// Forgot Password
router.post("/forgotpassword", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(404).json({ message: "Please enter Email Address" });
  }
  const studentCollection = db.collection("students");
  try {
    const studentCheck = await studentCollection.findOne({ email: email });
    if (!studentCheck) {
      return res.status(404).json({ message: "Student not Found" });
    }
    const token = jwt.sign({ _id: studentCheck._id }, process.env.SECRET_KEY, {
      expiresIn: "5m",
    });
    const link = process.env.FRONTEND + `/forgotpassword/new?token=${token}`;

    await transporter.sendMail({
      from: `St Clare Online Enrollment <${process.env.TRANSPORTER_EMAIL}>`,
      to: email,
      subject: "Forgot Password Request",
      html: `Click <a href=${link}>here</a> to proceed to the next step`,
    });
    res.status(200).json({ message: "A link was sent to the email" });
  } catch (error) {
    console.error(error);
    res.status(500);
  }
});

//New Password
router.patch("/newPassword", async (req, res) => {
  const { newPassword } = req.body;
  const { token } = req.query;
  if (!newPassword || !token) {
    res.status(404).json({ message: "Fields are empty" });
  }
  const payload = jwt.verify(token, process.env.SECRET_KEY);
  if (!payload) {
    res.status(400).json({ message: "Token Expired" });
  }
  try {
    const studentCollection = db.collection("students");
    const studentCheck = await studentCollection.findOne({
      _id: new ObjectId(String(payload._id)),
    });
    if (!studentCheck) {
      return res.status(404).json("Student not Found");
    }
    const passwordValidation = await bcrypt.compare(
      newPassword,
      studentCheck.password
    );
    if (passwordValidation) {
      return res
        .status(400)
        .json({ message: "Password cannot be the same as the last" });
    }

    const hashPassword = await bcrypt.hash(newPassword, 10);
    const student = await studentCollection.updateOne(
      { _id: studentCheck._id },
      { $set: { password: hashPassword } }
    );
    if (student.matchedCount === 0) {
      return res.status(404).json({ message: "Student not Found" });
    }
    res.status(200).json({ message: "Password has been updated" });
  } catch (error) {
    console.error(error);
    res.status(500);
  }
});

//Profile Data
router.get("/profile-data/:id", async (req, res) => {
  try {
    const collection = db.collection("students");
    const query = { _studentId: req.params.id };
    const profileData = await collection.findOne(query);
    res.send(profileData).status(200);
  } catch (error) {
    res.status(500).send("Profile not found");
  }
});

//Update Student Profile
router.patch("/profile-data/:id/update", async (req, res) => {
  const { auth, data } = req.body;
  try {
    const collection = db.collection("students");
    const emailCheck = await collection.findOne({ email: auth.email });
    if (!emailCheck) {
      return res
        .status(404)
        .json({ success: false, message: "Invalid Credentials" });
    }
    const passwordValidation = await bcrypt.compare(
      auth.password,
      emailCheck.password
    );
    if (!passwordValidation) {
      return res
        .status(404)
        .json({ success: false, message: "Invalid Credentials" });
    }
    const query = { _studentId: req.params.id };
    const profile = {
      $set: {
        ...data,
      },
    };

    const result = await collection.updateOne(query, profile);
    if (result.matchedCount === 0) {
      res.status(404).json({ success: false, message: "Student not Found" });
    }
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

//Get Invoice by Year/Semester

router.get(
  "/invoices/:id/:yearLevel/:schoolYear/:semester",
  async (req, res) => {
    try {
      const collection = db.collection("payments");
      const query = {
        studentId: req.params.id,
        yearLevel: parseInt(req.params.yearLevel),
        schoolYear: req.params.schoolYear,
        semester: req.params.semester,
      };
      const invoice = await collection.find(query).toArray();
      res.send(invoice).status(200);
    } catch (error) {
      res.status(404).send("Error retrieving invoices");
    }
  }
);

//Get Invoice
router.get("/invoice/:id", async (req, res) => {
  try {
    const collection = db.collection("payments");
    const query = { studentId: req.params.id };
    const invoice = await collection.find(query).toArray();
    res.send(invoice).status(200);
  } catch (e) {
    console.error(e);
    res.status(500).send("Error retrieving invoice");
  }
});

//Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const query = { email: email };
  let result;

  try {
    let collection = db.collection("students");
    let user = await collection.findOne(query);
    if (!user) {
      result = null;
      res.status(200).json(result);
      return;
    }
    if (!user.verified) {
      result = null;
      return res.status(404).json(result);
    }
    const validation = await bcrypt.compare(password, user.password);
    if (!validation) {
      result = null;
      res.status(200).json(result);
      return;
    }

    result = {
      id: user._studentId,
      name: user.fname + " " + user.mname + " " + user.lname,
      email: user.email,
    };
    res.status(200).json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

//Events
router.get("/events", async (req, res) => {
  try {
    const collection = db.collection("events");
    const events = await collection.find({}, { sort: { date: 1 } }).toArray();
    if (!events) {
      return null;
    }
    res.send(events).status(200);
  } catch (error) {
    res.status(404);
  }
});

//
router.post("/payment/:studentId", async (req, res) => {
  try {
    const { studentId } = req.params;
    const { examPeriod } = req.body;

    if (!studentId || !examPeriod) {
      return res.status(400).json({
        error: "Select an Exam period.",
      });
    }

    const student = await db
      .collection("students")
      .findOne({ _studentId: studentId });
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const existingPaymentForPeriod = await db.collection("payments").findOne({
      studentId: student._studentId,
      yearLevel: student.yearLevel,
      schoolYear: student.schoolYear,
      semester: student.semester,
      examPeriod,
    });

    if (existingPaymentForPeriod) {
      const errorMessage =
        examPeriod === "downpayment"
          ? "Downpayment has already been paid"
          : `${examPeriod} payment has already been made by this student.`;
      return res.status(400).json({ error: errorMessage });
    }

    if (!student.tuitionFee || student.tuitionFee === 0) {
      student.tuitionFee = 14000;
    }

    const billing = {
      name: `${student.fname} ${student.mname || ""} ${student.lname}`,
      email: student.email,
      phone: student.mobile,
    };

    const metadata = {
      studentId: student._studentId,
      course: student.course || "",
      education: student.education || "",
      yearLevel: student.yearLevel || "",
      schoolYear: student.schoolYear || "",
      semester: student.semester || "",
      examPeriod: examPeriod,
    };

    let payment = 0;
    if (examPeriod === "Remaining") {
      const query = {
        studentId: student._studentId,
        yearLevel: student.yearLevel,
        schoolYear: student.schoolYear,
        semester: student.semester,
      };

      const payments = await db.collection("payments").find(query).toArray();
      const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const remaining = 14000 - totalPaid;
      if (remaining <= 0) {
        return res.status(400).json({ error: "No remaining balance to pay" });
      }
      payment = remaining * 100;
    } else {
      payment = examPeriod === "Downpayment" ? 2000 * 100 : 1500 * 100;
    }

    const API_KEY = process.env.PAY_MONGO;
    const encodedKey = Buffer.from(`${API_KEY}:`).toString("base64");

    const paymongoRes = await fetch(
      "https://api.paymongo.com/v1/checkout_sessions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${encodedKey}`,
        },
        body: JSON.stringify({
          data: {
            attributes: {
              billing,
              line_items: [
                {
                  amount: payment,
                  currency: "PHP",
                  description: "Tuition payment for " + examPeriod,
                  name: examPeriod,
                  quantity: 1,
                },
              ],
              payment_method_types: ["paymaya", "gcash", "card"],
              send_email_receipt: true,
              show_line_items: true,
              reference_number: `ref-${student._studentId}-${Date.now()}`,
              metadata: { ...metadata },
            },
          },
        }),
      }
    );

    if (!paymongoRes.ok) {
      const errorData = await paymongoRes.json();
      console.error("❌ PayMongo Error:", errorData);
      return res.status(500).json({
        error: "PayMongo checkout creation failed",
        details: errorData,
      });
    }

    const paymongoData = await paymongoRes.json();
    res
      .json({
        success: true,
        checkoutUrl: paymongoData.data.attributes.checkout_url,
      })
      .status(201);
  } catch (error) {
    console.error("❌ Server Error:", error);
    return res.status(500).json({ error: error.message || "Payment failed" });
  }
});

export default router;
