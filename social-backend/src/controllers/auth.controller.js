const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const User = require("../models/User");
const { AppError } = require("../utils/errors");

const registerSchema = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

async function register(req, res, next) {
  try {
    const body = registerSchema.parse(req.body);

    const exists = await User.findOne({
      $or: [{ email: body.email }, { username: body.username }],
    });

    if (exists)
      throw new AppError("Email or username already exists", 409, "CONFLICT");

    const passwordHash = await bcrypt.hash(body.password, 10);

    const user = await User.create({
      username: body.username,
      email: body.email,
      passwordHash,
    });

    const token = signToken(user._id.toString());

    res.status(201).json({
      ok: true,
      data: {
        token,
        user: { id: user._id, username: user.username, email: user.email },
      },
    });
  } catch (err) {
    // zod error -> 400
    if (err?.name === "ZodError")
      return next(
        new AppError(
          err.errors[0]?.message || "Invalid input",
          400,
          "VALIDATION_ERROR",
        ),
      );
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const body = loginSchema.parse(req.body);

    const user = await User.findOne({ email: body.email });
    if (!user) throw new AppError("Invalid credentials", 401, "UNAUTHORIZED");

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) throw new AppError("Invalid credentials", 401, "UNAUTHORIZED");

    const token = signToken(user._id.toString());

    res.json({
      ok: true,
      data: {
        token,
        user: { id: user._id, username: user.username, email: user.email },
      },
    });
  } catch (err) {
    if (err?.name === "ZodError")
      return next(
        new AppError(
          err.errors[0]?.message || "Invalid input",
          400,
          "VALIDATION_ERROR",
        ),
      );
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const userId = req.user?.sub;
    const user = await User.findById(userId).select(
      "_id username email bio avatarUrl createdAt",
    );
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");

    res.json({ ok: true, data: user });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me };
