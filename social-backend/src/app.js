const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const path = require("path");

const routes = require("./routes");
const { errorHandler } = require("./middlewares/errorHandler");
const { mediaRoot } = require("./config/media");

function createApp() {
  const app = express();

  app.use(
    cors({
      origin: ["http://localhost:5173"],
      credentials: true,
    }),
  );

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan("dev"));

  app.use("/uploads", express.static(mediaRoot));
  app.use("/uploads/posts", express.static(path.join(mediaRoot, "posts")));

  app.use("/api", routes);
  app.use(express.static(path.join(__dirname, "..", "public")));
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
