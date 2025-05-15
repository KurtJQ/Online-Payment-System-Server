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

    const existingPaymentForPeriod = await invoiceCollection.findOne({
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

      const payments = await invoiceCollection.find(query).toArray();
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
