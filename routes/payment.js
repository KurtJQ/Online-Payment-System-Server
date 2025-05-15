import express from "express";
import db from "../db/connection.js";

const router = express.Router();
const invoiceCollection = db.collection("payments");

//Get Invoice by Year/Semester

router.get(
  "/invoices/:id/:yearLevel/:schoolYear/:semester",
  async (req, res) => {
    try {
      const query = {
        studentId: req.params.id,
        yearLevel: parseInt(req.params.yearLevel),
        schoolYear: req.params.schoolYear,
        semester: req.params.semester,
      };
      const invoice = await invoiceCollection.find(query).toArray();
      res.send(invoice).status(200);
    } catch (error) {
      res.status(404).send("Error retrieving invoices");
    }
  }
);

//Get Invoice
router.get("/invoice/:id", async (req, res) => {
  try {
    const query = { studentId: req.params.id };
    const invoice = await invoiceCollection.find(query).toArray();
    res.send(invoice).status(200);
  } catch (e) {
    console.error(e);
    res.status(500).send("Error retrieving invoice");
  }
});

//Get payment Settings
router.get("/settings", async (req, res) => {
  try {
    const settings = await db.collection("payment-settings").find({}).toArray();
    res.status(200).json(settings);
  } catch (error) {
    console.error(error);
    res.status(500);
  }
});

// Make Payment
router.post("/payment/:studentId", async (req, res) => {
  try {
    const { studentId } = req.params;
    const { examPeriod, amount } = req.body;

    if (!studentId || !examPeriod || !amount) {
      return res.status(400).json({
        error: "Fields cannot be empty.",
      });
    }

    const student = await db
      .collection("students")
      .findOne({ _studentId: studentId });
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    if (examPeriod === "Remaining") {
      const paymentSettings = await db
        .collection("payment-settings")
        .find({})
        .toArray();
      const maxPayment = paymentSettings.reduce(
        (sum, items) => sum + Number(items.amount),
        0
      );
      const remainingBalance = await invoiceCollection
        .find({
          studentId: student._studentId,
          yearLevel: student.yearLevel,
          schoolYear: student.schoolYear,
          semester: student.semester,
        })
        .toArray();
      const currentlyPaid = remainingBalance.reduce(
        (sum, items) => sum + Number(items.amount),
        0
      );
      const totalBalance = maxPayment - currentlyPaid;
      if (Number(amount) > totalBalance) {
        return res.status(400).json({ error: "Amount exceeded the balance" });
      }
    } else {
      const paymentSetting = await db
        .collection("payment-settings")
        .findOne({ examPeriod: examPeriod });
      if (!paymentSetting) {
        return res.status(400).json({ error: "Invalid exam period." });
      }
      const currentTotalPaid = await invoiceCollection
        .find({
          studentId: student._studentId,
          yearLevel: student.yearLevel,
          schoolYear: student.schoolYear,
          semester: student.semester,
          examPeriod,
        })
        .toArray();
      const currentlyPaid = currentTotalPaid.reduce(
        (sum, items) => sum + Number(items.amount),
        0
      );
      const totalBalance = Number(paymentSetting.amount) - currentlyPaid;
      if (Number(amount) > totalBalance) {
        return res.status(400).json({ error: "Amount exceeded the balance" });
      }
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
                  amount: Number(amount) * 100,
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
