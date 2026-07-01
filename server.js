import express from "express";
import mongoose from "mongoose";
import path from "path";

const app = express();

app.use(express.static(process.cwd()));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log(err));

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});

app.get("/users", async (req, res) => {
  const User = mongoose.model("User", {
    name: String,
    email: String,
  });

  const users = await User.find();
  res.json(users);
});

export default app;