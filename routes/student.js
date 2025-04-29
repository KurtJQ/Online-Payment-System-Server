import express from "express";
import db from "../db/connection.js";
import { Int32 } from "mongodb";
import bcrypt from "bcryptjs";

const router = express.Router();

router.get("/", async (req, res) => {
  let collection = db.collection("students");
  let results = await collection.find({}).toArray();
  res.send(results).status(200);
});

//New Student Registration
router.post("/new", async (req, res) => {
  try {
    const collection = db.collection("students");
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
    const newStudent = {
      _studentId: newStudentNumber,
      ...req.body,
    };
    let result = await collection.insertOne(newStudent);
    res.send(result).status(201);
  } catch (e) {
    res.status(500).send("Error Registering");
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
  try {
    const query = { _studentId: req.params.id };
    const profile = {
      $set: {
        ...req.body,
      },
    };
    const collection = db.collection("students");
    const result = await collection.updateOne(query, profile);
    if (result.matchedCount === 0) {
      res.send("User not found").status(404);
    }
    res.send(result).status(200);
  } catch (error) {
    res.status(500).send("Profile not found");
  }
});

//Get Invoice by Year/Semester

router.get("/invoices/:id/:yearLevel/:schoolYear", async (req, res) => {
  try {
    const collection = db.collection("payments");
    const query = {
      studentId: req.params.id,
      yearLevel: req.params.yearLevel,
      schoolYear: req.params.schoolYear,
    };
    const invoice = await collection.find(query).toArray();
    res.send(invoice).status(200);
  } catch (error) {
    res.status(404).send("Error retrieving invoices");
  }
});

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

    if (!studentId || examPeriod.length === 0) {
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
    };

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
              line_items: examPeriod.map((item) => ({
                amount: item === "Downpayment" ? 2000 * 100 : 1500 * 100,
                currency: "PHP",
                description: "Tuition payment for " + item,
                name: item,
                quantity: 1,
              })),
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
        error: "PayMongo payment intent creation failed",
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

    // const payment = {
    //   paymentId: linkData.id,
    //   amount,
    //   referenceNumber: linkData.attributes.reference_number,
    //   description,
    //   billingDetails,
    //   studentRef: student._id,
    //   studentId: student._studentId,
    //   fname: student.fname,
    //   mname: student.mname,
    //   lname: student.lname,
    //   course: student.course,
    //   education: student.education,
    //   yearLevel: student.yearLevel,
    //   schoolYear: student.schoolYear,
    //   semester: student.semester,
    //   examPeriod,
    //   createdAt: new Date(),
    // };

    // await db.collection("payments").insertOne(payment);

    // await db.collection("students").updateOne(
    //   { _studentId: student._studentId },
    //   {
    //     $push: { payments: payment.paymentId },
    //     $inc: { totalPaid: parseInt(amount) },
    //     $set: { balance: student.tuitionFee - (student.totalPaid + amount) },
    //   }
    // );

    // return res.status(201).json({
    //   success: true,
    //   //   data: payment,
    //   checkoutUrl: linkData.attributes.checkout_url,
    // });
  } catch (error) {
    console.error("❌ Server Error:", error);
    return res.status(500).json({ error: error.message || "Payment failed" });
  }
});

export default router;
