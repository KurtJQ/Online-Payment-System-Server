import express from "express";
import db from "../db/connection.js";

const router = express.Router();

router.post("/payment/success", async (req, res) => {
  const data = req.body?.data?.attributes?.data;
  try {
    const newPayment = {
      paymentId: data?.id,
      amount: data?.attrbiutes.amount / 100,
      referenceNumber: data?.reference_number,
      description: data?.description,
      billingDetails: {
        name: data?.billing.name,
        email: data?.billing.email,
        phone: data?.billing.phone,
      },
      createdAt: new Date(req.body?.data?.created_at).toISOString(),
    };
    const collection = db.collection("payments");
    const result = await collection.insertOne(newPayment);

    res.send(result).status(201);
  } catch (error) {
    res.status(400).send("ERROR: ", error);
  }
});

export default router;
