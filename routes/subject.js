import express from "express";
import db from "../db/connection.js";

const router = express.Router();
const curriculumCollection = db.collection("curriculums");

router.get("/get/:course/:yearLevel/:semester", async (req, res) => {
  try {
    const { course, yearLevel, semester } = req.params;
    const subjects = await curriculumCollection.findOne({
      course,
      yearLevel,
      semester,
    });
    res.status(200).json(subjects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
