const express = require("express");
const { register, login, sessionStatus } = require("../controllers/auth.controller");
const { sessionUser } = require("../middlewares/sessionUser");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/session-status", sessionUser, sessionStatus);

module.exports = router;
