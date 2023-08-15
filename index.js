const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const jwtSecret = "fasefraw4r5r3wq45wdfgw34twdfg";
const UserModel = require("./model/user");
const cookieParser = require("cookie-parser");
const imageDownloader = require("image-downloader");
const multer = require("multer");
const fs = require("fs");
const Place = require("./model/place");
const Booking = require("./model/booking");
require("dotenv").config();
const app = express();
const photosMiddleware = multer({ dest: "uploads" });

function getUserDataFromReq(req) {
  return new Promise((resolve, reject) => {
    jwt.verify(req.cookies.token, jwtSecret, {}, async (err, userData) => {
      if (err) throw err;
      resolve(userData);
    });
  });
}

const bcryptSalt = bcrypt.genSaltSync(10);

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    credentials: true,
    origin: "http://localhost:3000",
  })
);

console.log(process.env.MONGO_URL);
mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

app.get("/test", (req, res) => {
  res.json("Test OK");
});

app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Please fill in all fields" });
  }

  try {
    const existingUser = await UserModel.findOne({ email: email });

    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const hashedPassword = bcrypt.hashSync(password, bcryptSalt);
    const user = await UserModel.create({
      name,
      email,
      password: hashedPassword,
    });

    res.status(200).json({ message: "Registration successful" });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const userDoc = await UserModel.findOne({ email: email });
  if (userDoc) {
    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
      jwt.sign(
        {
          email: userDoc.email,
          id: userDoc._id,
        },
        jwtSecret,
        {},
        (err, token) => {
          if (err) throw err;
          res.cookie("token", token).json(userDoc);
        }
      );
    } else {
      res.status(422).json("pass not ok");
    }
  } else {
    res.json("not found");
  }
});

app.get("/profile", (req, res) => {
  const { token } = req.cookies;
  if (token) {
    jwt.verify(token, jwtSecret, {}, async (err, user) => {
      if (err) throw err;
      const { name, email, _id } = await UserModel.findById(user.id);
      res.json({ name, email, _id });
    });
  } else {
    res.json(null);
  }
});

app.post("/logout", (req, res) => {
  res.clearCookie("token").json(true);
});

app.post("/upload-by-link", async (req, res) => {
  const { link } = req.body;
  const newName = "photo" + Date.now() + ".jpg";

  try {
    const options = {
      url: link,
      dest: __dirname + "/uploads/" + newName,
    };

    const { filename, image } = await imageDownloader.image(options);
    console.log("Downloaded image:", filename);
    res.json({ filename: newName });
  } catch (error) {
    console.error("Error downloading photo:", error.message);
    res
      .status(500)
      .json({ error: "Failed to download the photo from the provided link" });
  }
});

// Serve static files from the "uploads" directory
app.use("/uploads", express.static(__dirname + "/uploads"));

// Handle server errors
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

const server = app.listen(4000, (err) => {
  if (err) {
    console.error("Error starting the server:", err);
  } else {
    console.log("Server is running on port 4000");
  }
});

app.post("/upload", photosMiddleware.array("photos", 100), (req, res) => {
  const uploadedFiles = [];
  for (let i = 0; i < req.files.length; i++) {
    const { path, originalname } = req.files[i];
    const parts = originalname.split(".");
    const ext = parts[parts.length - 1];
    const newPath = path + "." + ext;
    fs.renameSync(path, newPath);
    uploadedFiles.push(newPath.replace("uploads/", ""));
  }
  res.json(uploadedFiles);
});

app.post("/places", (req, res) => {
  const { token } = req.cookies;
  jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    if (err) {
      console.error("Error verifying JWT token:", err);
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      title,
      address,
      addedPhotos,
      description,
      perks,
      extraInfo,
      checkIn,
      checkOut,
      maxGuests,
      price,
    } = req.body;

    try {
      const placeDoc = await Place.create({
        owner: userData.id,
        title,
        address,
        photos: addedPhotos,
        description,
        perks,
        extraInfo,
        checkIn,
        checkOut,
        maxGuests,
        price,
      });
      res.json(placeDoc);
    } catch (error) {
      console.error("Error creating place:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
});

app.get("/user-places", async (req, res) => {
  const { token } = req.cookies;
  jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    if (err) {
      console.error("Error verifying JWT token:", err);
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = userData;
    try {
      const places = await Place.find({ owner: id });
      res.json(places);
    } catch (error) {
      console.error("Error fetching places:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
});

app.get("/places/:id", async (req, res) => {
  const { id } = req.params;
  res.json(await Place.findById(id));
});

app.put("/places", async (req, res) => {
  const { token } = req.cookies;
  const {
    id,
    title,
    address,
    addedPhotos,
    description,
    perks,
    extraInfo,
    checkIn,
    checkOut,
    maxGuests,
    price,
  } = req.body;

  jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    if (err) {
      console.error("Error verifying JWT token:", err);
      return res.status(401).json({ error: "Unauthorized" });
    }

    const placeDoc = await Place.findById(id);
    if (userData.id === placeDoc.owner.toString()) {
      placeDoc.set({
        title,
        address,
        photos: addedPhotos,
        description,
        perks,
        extraInfo,
        checkIn,
        checkOut,
        maxGuests,
        price,
      });
      try {
        await placeDoc.save();
        res.json("ok");
      } catch (error) {
        console.error("Error updating place:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    }
  });
});

app.get("/places", async (req, res) => {
  res.json(await Place.find());
});

app.post("/bookings", async (req, res) => {
  const userData = await getUserDataFromReq(req);
  const { place, checkIn, checkOut, numberOfGuests, name, phone, price } =
    req.body;
  Booking.create({
    place,
    checkIn,
    checkOut,
    numberOfGuests,
    name,
    phone,
    price,
    user: userData.id,
  })
    .then((doc) => {
      res.json(doc);
    })
    .catch((err) => {
      throw err;
    });
});

app.get("/bookings", async (req, res) => {
  const userData = await getUserDataFromReq(req);
  res.json(await Booking.find({ user: userData.id }));
});

// Handle server errors
server.on("error", (err) => {
  console.error("Server error:", err);
});
