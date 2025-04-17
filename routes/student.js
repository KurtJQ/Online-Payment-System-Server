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

// Events

router.get("/events", async (req, res) => {
  try {
    const collection = db.collection("events");
    const events = await collection.find({}, { sort: { date: 1 } }).toArray();
    if (!events) {
      return null;
    }

    res.send(events).status(200);
  } catch (error) {
    res.status(400);
  }
});

export default router;
