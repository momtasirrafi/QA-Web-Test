import express from "express";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files
app.use(express.static(__dirname));

// Homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// MongoDB
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

const User = mongoose.model("User", {
  name: String,
  email: String,
});

app.get("/users", async (req, res) => {
  const users = await User.find();
  res.json(users);
});

// IMPORTANT
export default app;

// Local only
if (process.env.NODE_ENV !== "production") {
  app.listen(3000, () => {
    console.log("Running on http://localhost:3000");
  });
}