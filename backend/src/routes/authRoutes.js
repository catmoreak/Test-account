const express = require("express");
const { loginUser, getUserById } = require("../services/authService");

const router = express.Router();

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "username and password are required" });
  }

  const user = loginUser(username, password);

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials. Please check your username and password." });
  }

  // In production: issue a signed JWT instead of returning the user object
  return res.json({
    success: true,
    user,
    sessionToken: Buffer.from(`${user.id}:${Date.now()}`).toString("base64")
  });
});

// GET /api/auth/me?userId=MCC-001
router.get("/me", (req, res) => {
  const userId = req.query.userId || req.headers["x-user-id"];
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const user = getUserById(userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.json({ user });
});

module.exports = router;
