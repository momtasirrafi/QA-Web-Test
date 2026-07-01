import express from "express";
import mongoose from "mongoose";

const app = express();

app.use(express.json());

// Connect to MongoDB
mongoose
  .connect("mongodb://127.0.0.1:27017/webtesting")
  .then(() => {
    console.log("✅ MongoDB Connected");
  })
  .catch((err) => {
    console.error("MongoDB Error:", err);
  });

// User model
const User = mongoose.model("User", {
  name: String,
  email: String,
});

// Get all users
app.get("/users", async (req, res) => {
  const users = await User.find();
  res.json(users);
});

// Start server
app.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});