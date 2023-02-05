const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const axios = require("axios");
const RequestModel = require("./model");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const csurf = require("tiny-csrf");
const rateLimit = require("express-rate-limit");

const app = express();

// CORS config
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  })
);

// array of allowed IP addresses
const allowedIps = ["127.0.0.1", "localhost", "::1"];

// Middleware to check the IP address
// Restrict the use of the anonymous user API based on IP
const checkIp = function (req, res, next) {
  const userIp = req.ip;
  if (allowedIps.includes(userIp)) {
    next();
  } else {
    res.status(403).send("Forbidden");
  }
};

// Parsing data from requests
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser("cookie-parser-secret"));

// Express session - cookie config
app.use(
  session({
    secret: "BigSecret",
    resave: true,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000 * 7, //seven days
      secure: false,
      sameSite: true,
    },
    saveUninitialized: true,
  })
);

// Rate limiter layer of protection against DDOS
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 500, // limit each IP to 500 requests per windowMs
  message: "Too many requests, please try again later",
});
app.use(limiter);

// CSRF protection config
app.use(
  csurf(
    "123456789iamasecret987654321look", // secret -- must be 32 bits or chars in length
    ["POST"] // the request methods we want CSRF protection for
  )
);

//  Mongo Database Connection
//  Didn't include an auth layer for the DB ( dev purpose)
connectDB().catch((err) => console.log(err));
async function connectDB() {
  mongoose.set("strictQuery", false);
  await mongoose.connect("mongodb://127.0.0.1:27017/flashy");
  console.log("Connected to Mongo Database");
}

// Route to send a CSRF token to the client
app.get("/csrf", checkIp, (req, res) => {
  const csrfToken = req.csrfToken();
  console.log("Getting CSRF Token", csrfToken);
  return res.json({ csrfToken: csrfToken });
});

// Route to send a request/response data to the client by {:id}
app.get("/:id", checkIp, async (req, res) => {
  try {
    const { id } = req.params;
    const request = await RequestModel.findById(id);
    if (!request) {
      console.log("The request doesn't exist");
      return res.json({ responseData: null });
    }
    return res.json({ responseData: request });
  } catch (err) {
    console.log(err);
    return res.json({ error: err });
  }
});

// Main Http requests route
app.post("/api/http/:method", checkIp, async (req, res) => {
  const { method } = req.params;
  const { url } = req.body;

  try {
    const response = await axios({
      method: method,
      url: url,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json;charset=UTF-8",
      },
    });

    const responseData = new RequestModel({
      url: {
        scheme: JSON.stringify(response.config.adapter),
        host: response.request.host,
        path: response.request.path,
      },
      response: {
        status: response.status,
        statusText: response.statusText,
        date: response.headers.date,
        server: response.headers.server,
      },
      request: {
        method: response.config.method,
        http: response.request.res.httpVersion,
        url: response.config.url,
      },
    });

    const savedRequest = await responseData.save();
    return res.json(savedRequest);
  } catch (error) {
    const { response } = error;
    // Check if its an axios error
    if (!response) {
      console.log(error);
      return res.json({ error: error });
    }
    const responseData = new RequestModel({
      url: {
        scheme: JSON.stringify(response.config.adapter),
        host: response.request.host,
        path: response.request.path,
      },
      response: {
        status: response.status,
        statusText: response.statusText,
        date: response.headers.date,
        server: response.headers.server,
      },
      request: {
        method: response.config.method,
        http: response.request.res.httpVersion,
        url: response.config.url,
      },
    });

    const savedRequest = await responseData.save();
    return res.json(savedRequest);
  }
});

// Testing redirects
// Tried to catch redirects
// app.all("*", function (req, res) {
//   res.status(302).redirect("http://localhost:8000/test");
// });
app.listen(8000, () => console.log("Node.js server running on port 8000"));
