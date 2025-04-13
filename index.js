import cors from "cors";
import express from "express";
import student from "./routes/student.js";
import "dotenv/config";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/student", student);

app.listen(process.env.PORT, () => {
  console.log(`Server is listening on port ${process.env.PORT}`);
});
