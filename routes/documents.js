import express from "express";
import db from "../db/connection.js";
import multer from "multer";

const router = express.Router();
const studentCollection = db.collection("students");
const upload = multer({ storage: multer.memoryStorage() });

router.post("/add", upload.single("file"), async (req, res) => {
  const file = req.file;
  const { _studentId, document } = req.body;
  if (!file || !_studentId) {
    return res.status(400).json({ message: "Missing File or Student ID" });
  }

  const base64String = file.buffer.toString("base64");

  try {
    const student = await studentCollection.updateOne(
      { _studentId: _studentId },
      {
        $push: {
          files: {
            filename: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            base64: base64String,
            doctype: document,
          },
        },
      }
    );
    res.status(201).json({ message: "File successfuly uploaded" });
  } catch (error) {
    console.error(error);
    res.status(500);
  }
});

export default router;
