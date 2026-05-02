require("dotenv").config();
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Datastore = require("nedb-promises");
const multer = require("multer");
const path = require("path");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});
const GEMINI_KEY = process.env.GEMINI_KEY;

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";

// Ensure data directory exists
const fs = require("fs");
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// Database setup
const usersDb = Datastore.create({
  filename: path.join(dataDir, "users.db"),
  autoload: true,
});
const receiptsDb = Datastore.create({
  filename: path.join(dataDir, "receipts.db"),
  autoload: true,
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Auth middleware
function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// ---- AUTH ROUTES ----

app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }
    const existing = await usersDb.findOne({ email });
    if (existing)
      return res.status(400).json({ error: "Email already registered" });

    const hash = await bcrypt.hash(password, 10);
    const user = await usersDb.insert({
      username,
      email,
      password: hash,
      createdAt: new Date(),
    });
    const token = jwt.sign(
      { _id: user._id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" },
    );
    res.json({
      token,
      user: { _id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "All fields are required" });

    const user = await usersDb.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { _id: user._id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" },
    );
    res.json({
      token,
      user: { _id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ---- PROFILE ROUTES (protected) ----

// Read profile
app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await usersDb.findOne({ _id: req.user._id });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Update profile
app.put("/api/profile", auth, async (req, res) => {
  try {
    const { username, email } = req.body;
    if (!username || !email) {
      return res.status(400).json({ error: "Username and email are required" });
    }
    // Check if email is taken by another user
    const existing = await usersDb.findOne({ email, _id: { $ne: req.user._id } });
    if (existing) return res.status(400).json({ error: "Email already in use" });

    await usersDb.update(
      { _id: req.user._id },
      { $set: { username, email } },
    );
    const updated = await usersDb.findOne({ _id: req.user._id });

    // Issue new token with updated info
    const newToken = jwt.sign(
      { _id: updated._id, username: updated.username, email: updated.email },
      JWT_SECRET,
      { expiresIn: "7d" },
    );
    res.json({
      token: newToken,
      user: { _id: updated._id, username: updated.username, email: updated.email },
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Change password
app.put("/api/profile/password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Both passwords are required" });
    }
    const user = await usersDb.findOne({ _id: req.user._id });
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(400).json({ error: "Current password is incorrect" });

    const hash = await bcrypt.hash(newPassword, 10);
    await usersDb.update({ _id: req.user._id }, { $set: { password: hash } });
    res.json({ message: "Password updated" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Delete account
app.delete("/api/profile", auth, async (req, res) => {
  try {
    await receiptsDb.remove({ userId: req.user._id }, { multi: true });
    await usersDb.remove({ _id: req.user._id });
    res.json({ message: "Account deleted" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ---- RECEIPT ROUTES (protected) ----

// Get all receipts for user
app.get("/api/receipts", auth, async (req, res) => {
  try {
    const receipts = await receiptsDb
      .find({ userId: req.user._id })
      .sort({ createdAt: -1 });
    res.json(receipts);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Create receipt
app.post("/api/receipts", auth, async (req, res) => {
  try {
    const {
      storeName,
      itemName,
      price,
      category,
      purchaseDate,
      returnDeadline,
    } = req.body;
    if (!storeName || !itemName || !price || !purchaseDate) {
      return res
        .status(400)
        .json({ error: "Store, item, price, and purchase date are required" });
    }
    const receipt = await receiptsDb.insert({
      userId: req.user._id,
      storeName,
      itemName,
      price: parseFloat(price),
      category: category || "Other",
      purchaseDate,
      returnDeadline: returnDeadline || null,
      createdAt: new Date(),
    });
    res.json(receipt);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Update receipt
app.put("/api/receipts/:id", auth, async (req, res) => {
  try {
    const {
      storeName,
      itemName,
      price,
      category,
      purchaseDate,
      returnDeadline,
    } = req.body;
    const existing = await receiptsDb.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!existing) return res.status(404).json({ error: "Receipt not found" });

    await receiptsDb.update(
      { _id: req.params.id },
      {
        $set: {
          storeName,
          itemName,
          price: parseFloat(price),
          category,
          purchaseDate,
          returnDeadline: returnDeadline || null,
        },
      },
    );
    const updated = await receiptsDb.findOne({ _id: req.params.id });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Delete receipt
app.delete("/api/receipts/:id", auth, async (req, res) => {
  try {
    const existing = await receiptsDb.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!existing) return res.status(404).json({ error: "Receipt not found" });
    await receiptsDb.remove({ _id: req.params.id });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Dashboard stats
app.get("/api/dashboard", auth, async (req, res) => {
  try {
    const receipts = await receiptsDb.find({ userId: req.user._id });
    const now = new Date();
    const totalSpending = receipts.reduce((sum, r) => sum + r.price, 0);

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const expiringSoon = receipts.filter((r) => {
      if (!r.returnDeadline) return false;
      const deadline = new Date(r.returnDeadline + "T00:00:00");
      const daysLeft = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
      return daysLeft >= 0 && daysLeft <= 7;
    });

    // Monthly spending (current month)
    const thisMonth = receipts.filter((r) => {
      const d = new Date(r.purchaseDate);
      return (
        d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      );
    });
    const monthlySpending = thisMonth.reduce((sum, r) => sum + r.price, 0);

    // Category breakdown
    const categories = {};
    receipts.forEach((r) => {
      categories[r.category] = (categories[r.category] || 0) + r.price;
    });

    res.json({
      totalReceipts: receipts.length,
      totalSpending,
      monthlySpending,
      expiringSoon: expiringSoon.length,
      expiringSoonItems: expiringSoon,
      categories,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Scan receipt image with Gemini
app.post(
  "/api/scan-receipt",
  auth,
  upload.single("receipt"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ error: "No image uploaded" });

      const base64Image = req.file.buffer.toString("base64");
      const mimeType = req.file.mimetype;

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Analyze this receipt image and extract the following information. Return ONLY a raw JSON object (no markdown, no code blocks) with these fields:
{"storeName":"store name","items":[{"name":"item name","price":0.00}],"totalPrice":0.00,"purchaseDate":"YYYY-MM-DD","category":"one of: Clothing, Tech, Food, Home, Health, Entertainment, Other"}
If you can't determine a field, use null. For the category, pick the best match. For the date, use the date on the receipt.`,
                  },
                  {
                    inlineData: { mimeType, data: base64Image },
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
            },
          }),
        },
      );

      if (!geminiRes.ok) {
        const errBody = await geminiRes.text();
        console.error("Gemini API error:", geminiRes.status, errBody);
        return res
          .status(500)
          .json({ error: "Gemini API error: " + geminiRes.status });
      }

      const geminiData = await geminiRes.json();
      console.log("Gemini raw response:", JSON.stringify(geminiData, null, 2));

      const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!text) {
        return res
          .status(500)
          .json({ error: "Gemini returned empty response" });
      }

      // responseMimeType ensures clean JSON, but fallback to regex extraction
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found in response");
        parsed = JSON.parse(jsonMatch[0]);
      }
      res.json(parsed);
    } catch (err) {
      console.error("Scan error:", err);
      res
        .status(500)
        .json({ error: "Failed to analyze receipt. Try a clearer image." });
    }
  },
);

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`ReceiptTrack server running on http://localhost:${PORT}`);
});
