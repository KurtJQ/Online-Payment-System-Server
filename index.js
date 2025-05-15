import cors from "cors";
import express from "express";
import student from "./routes/student.js";
import webhooks from "./routes/webhook.js";
import classes from "./routes/class.js";
import subject from "./routes/subject.js";
import payments from "./routes/payment.js";
import documents from "./routes/documents.js";
import "dotenv/config";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/student", student);
app.use("/webhooks", webhooks);
app.use("/api/class", classes);
app.use("/api/subject", subject);
app.use("/api/payment", payments);
app.use("/api/documents", documents);

app.listen(process.env.PORT, () => {
  console.log(`Server is listening on port ${process.env.PORT}`);
});
