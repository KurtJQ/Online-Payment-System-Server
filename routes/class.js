import express from "express";
import db from "../db/connection.js";
import { ObjectId } from "mongodb";

const router = express.Router();
const sectionCollection = db.collection("sections");
const studentCollection = db.collection("students");

// Get Class
router.get("/get", async (req, res) => {
  try {
    const classes = await sectionCollection.find({}).toArray();
    res.status(200).send(classes);
  } catch (error) {
    res.status(500).send("ERROR: " + error);
  }
});

// Get Class by yearLevel, semester, course, schoolYear
router.get(
  "/get/:course/:yearLevel/:semester/:schoolYear",
  async (req, res) => {
    try {
      const query = {
        course: req.params.course,
        yearLevel: req.params.yearLevel,
        semester: req.params.semester,
        schoolYear: req.params.schoolYear,
      };
      const classes = await sectionCollection.find(query).toArray();
      res.status(200).send(classes);
    } catch (error) {
      res.status(500).send("ERROR: " + error);
    }
  }
);

//Add to class
router.patch("/add", async (req, res) => {
  const { _id, _studentId } = req.body;
  try {
    if (!_id || !_studentId) {
      return res.status(400).json({ error: "Please select a Section" });
    }
    const classID = new ObjectId(String(_id));
    const classCheck = await sectionCollection.findOne({ _id: classID });
    if (!classCheck) {
      return res.status(404).json({ error: "Class not Found" });
    }
    if (classCheck.students.length >= classCheck.maxLimit) {
      return res.status(400).json({ error: "Class is at full capacity" });
    }
    const studentCheck = await studentCollection.findOne({
      _studentId: _studentId,
    });
    if (!studentCheck) {
      return res.status(404).json({ error: "Student not Found" });
    }
    if (classCheck.students.includes(studentCheck._id)) {
      return res.status(400).json({ error: "Student is already in class" });
    }

    if (classCheck.students.length >= 50) {
      return res.status(400).json({ error: "Class is Full" });
    }

    const classes = await sectionCollection.updateOne(
      { _id: classID },
      { $addToSet: { students: studentCheck._id } }
    );
    const student = await studentCollection.updateOne(
      { _studentId: _studentId },
      { $set: { section: classCheck.sectionID } }
    );

    return res.status(200).json({ class: classes, student: student });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
