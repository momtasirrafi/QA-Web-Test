import express from "express";
import mongoose from "mongoose";
import path from "path";

const app = express();

app.use(express.static("."));

// Connect to MongoDB
if (process.env.MONGODB_URI) {
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch((err) => console.error(err));
}

// User model
const User = mongoose.model(
  "User",
  new mongoose.Schema({
    name: String,
    email: String,
  })
);

// Home page
app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});

// API
app.get("/users", async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// IMPORTANT for Vercel
export default app;