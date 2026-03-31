const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const User = require("../models/User");
const { AppError } = require("../utils/errors");

const registerSchema = z.object({
  username: z.string().min(3, "Username tối thiểu 3 ký tự").max(30),
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"),
});

const loginSchema = z.object({
  login: z.string().trim().min(1, "Email hoặc username không được để trống").optional(),
  email: z.string().trim().optional(),
  password: z.string().min(1, "Mật khẩu không được để trống"),
});

function signToken(user) {
  const secret = process.env.JWT_SECRET || "dev_jwt_secret_change_me";
  return jwt.sign(
    {
      sub: String(user._id),
      username: user.username,
      email: user.email,
    },
    secret,
    { expiresIn: "7d" },
  );
}

async function register(req, res, next) {
  try {
    const body = registerSchema.parse(req.body);
    const username = body.username.trim().toLowerCase();
    const email = body.email.trim().toLowerCase();

    const existedEmail = await User.findOne({ email });
    if (existedEmail) {
      throw new AppError("Email đã tồn tại", 409, "EMAIL_EXISTS");
    }

    const existedUsername = await User.findOne({ username });
    if (existedUsername) {
      throw new AppError("Username đã tồn tại", 409, "USERNAME_EXISTS");
    }

    const passwordHash = await bcrypt.hash(body.password, 10);

    const newUser = await User.create({
      username,
      email,
      passwordHash,
      bio: "",
      avatarUrl: "",
    });

    const token = signToken(newUser);

    return res.status(201).json({
      ok: true,
      message: "Đăng ký thành công",
      data: {
        token,
        user: {
          id: String(newUser._id),
          username: newUser.username,
          email: newUser.email,
          bio: newUser.bio,
          avatarUrl: newUser.avatarUrl,
          createdAt: newUser.createdAt,
        },
      },
    });
  } catch (err) {
    if (err?.name === "ZodError") {
      return next(
        new AppError(
          err.issues?.[0]?.message || err.errors?.[0]?.message || "Dữ liệu không hợp lệ",
          400,
          "VALIDATION_ERROR",
        ),
      );
    }
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const body = loginSchema.parse(req.body);
    const loginValue = String(body.login || body.email || '').trim();
    const normalized = loginValue.toLowerCase();

    const user = await User.findOne(
      normalized.includes('@')
        ? { email: normalized }
        : { username: normalized },
    );
    if (!user) {
      throw new AppError(
        "Email hoặc mật khẩu không đúng",
        401,
        "INVALID_LOGIN",
      );
    }

    const matched = await bcrypt.compare(body.password, user.passwordHash);
    if (!matched) {
      throw new AppError(
        "Email hoặc mật khẩu không đúng",
        401,
        "INVALID_LOGIN",
      );
    }

    const token = signToken(user);

    return res.json({
      ok: true,
      message: "Đăng nhập thành công",
      data: {
        token,
        user: {
          id: String(user._id),
          username: user.username,
          email: user.email,
          bio: user.bio,
          avatarUrl: user.avatarUrl,
          createdAt: user.createdAt,
        },
      },
    });
  } catch (err) {
    if (err?.name === "ZodError") {
      return next(
        new AppError(
          err.issues?.[0]?.message || err.errors?.[0]?.message || "Dữ liệu không hợp lệ",
          400,
          "VALIDATION_ERROR",
        ),
      );
    }
    next(err);
  }
}

module.exports = {
  register,
  login,
};
