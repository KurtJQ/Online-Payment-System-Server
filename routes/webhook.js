import express from "express";
import db from "../db/connection.js";

const router = express.Router();

router.post("/payment/success", async (req, res) => {
  // const data = req.body?.data?.attributes?.data
  // try {
  // const newPayment = {
  //   paymentId: data?.id,
  //   amount: data?.attrbiutes.amount / 100,
  // };
  // const collection = db.collection("payments");
  // } catch (error) {}

  console.log(req.body);
  res.send(200);
});

export default router;
