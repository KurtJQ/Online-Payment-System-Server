import express from "express";
import db from "../db/connection.js";
import { Int32 } from "mongodb";

const router = express.Router();

router.post("/payment/new", async (req, res) => {
  const data = req.body?.data?.attributes?.data;
  try {
    const studentCollection = db.collection("students");
    const studentSearch = await studentCollection.findOne({
      _studentId: data.attributes.metadata.studentId,
    });

    const newPayment = {
      paymentId: data?.id,
      amount: data?.attributes.line_items[0].amount / 100,
      referenceNumber: data?.attributes.reference_number,
      description: data?.attributes.line_items[0].description,
      billingDetails: {
        name: data?.attributes.billing.name,
        email: data?.attributes.billing.email,
        phone: data?.attributes.billing.phone,
      },
      studentRef: studentSearch._id,
      studentId: data?.attributes.metadata.studentId,
      fname: studentSearch.fname,
      mname: studentSearch.mname,
      lname: studentSearch.lname,
      course: data?.attributes.metadata.course,
      semester: data?.attributes.metadata.semester,
      education: data?.attributes.metadata.education,
      yearLevel: new Int32(parseInt(data?.attributes.metadata.yearLevel)),
      schoolYear: data?.attributes.metadata.schoolYear,
      examPeriod: data?.attributes.line_items[0].name,
      status: data?.attributes.payments[0].attributes.status,
      paymentMethod: data?.attributes?.payments?.[0]?.attributes?.source?.type,
      createdAt: new Date(data.attributes.created_at * 1000),
    };
    const paymentCollection = db.collection("payments");
    const result = await paymentCollection.insertOne(newPayment);

    res.status(201).send({ result });
  } catch (error) {
    res.status(400).send("ERROR: " + error);
  }
});

export default router;
