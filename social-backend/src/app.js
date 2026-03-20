const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const routes = require("./routes");
const { errorHandler } = require("./middlewares/errorHandler");
const { mediaRoot } = require("./config/media");

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan("dev"));

 app.use(
   cors({
     origin: ["http://localhost:5173"],
     credentials: true,
   }),
 );

 // Quan trọng: tránh chặn ảnh/video khác origin
 app.use(
   helmet({
     crossOriginResourcePolicy: { policy: "cross-origin" },
   }),
 );

 app.use(express.json());
 app.use(express.urlencoded({ extended: true }));

 // Static media
 app.use(
   "/uploads",
   express.static(path.join("D:\\Data"), {
     setHeaders: (res, filePath) => {
       res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
       res.setHeader("Access-Control-Allow-Credentials", "true");
       res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
     },
   }),
 );
  // API
  app.use("/api", routes);

  // Uploaded files + static test UI
  app.use("/uploads/posts", express.static(path.join(mediaRoot, "posts")));
  app.use(express.static(path.join(__dirname, "..", "public")));

  // Error handler
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
