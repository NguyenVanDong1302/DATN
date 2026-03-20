const { AppError } = require("../utils/errors");

function errorHandler(err, req, res, next) {
  const isAppError = err instanceof AppError;
  const status = isAppError ? err.statusCode : 500;
  const code = isAppError ? err.code : "INTERNAL_SERVER_ERROR";
  const message = isAppError
    ? err.message
    : err?.message || "Something went wrong";

  console.error("🔥 ERROR:", err); // <-- cái này giúp thấy lỗi thật trong terminal

  res.status(status).json({
    ok: false,
    code,
    message,
  });
}

module.exports = { errorHandler };
