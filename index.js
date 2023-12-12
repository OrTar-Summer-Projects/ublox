const { SerialPort } = require("serialport");
const { StringStream } = require("scramjet");
const express = require("express");
const socketIO = require("socket.io");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");

// MongoDB connection string
const url = `mongodb+srv://tarekhelal98:aLVgjExuXKvmd58i@cluster0.wappfmq.mongodb.net/?retryWrites=true&w=majority`;

// Create an Express application
const app = express();
app.use(cors());

let port;
let parser;

// Create a SerialPort instance for communication with the u-blox board
SerialPort.list()
  .then((ports) => {
    const ubloxPort = ports.find((portInfo) => {
      return portInfo.friendlyName.includes("USB Serial Device");
    });

    if (ubloxPort) {
      console.log("u-blox Device found on port " + ubloxPort.path);

      // Create a SerialPort instance for communication with the u-blox board
      port = new SerialPort({ path: ubloxPort.path, baudRate: 115200 });

      // Use Scramjet's StringStream to read data line by line from the SerialPort
      parser = port.pipe(new StringStream()).lines();

      // Listen for data from the u-blox board
      parser.on("data", (line) => {
        // Parse the NMEA sentence
        const sentence = line.split(",");
        console.log(sentence);

        // Check if the sentence includes longitude and latitude data
        if (sentence[0].startsWith("$GNGLL")) {
          var latitude = sentence[1] + sentence[2];
          var longitude = sentence[3] + sentence[4];

          // Check if latitude and longitude are not empty
          if (latitude && longitude) {
            // Converts the latitude from Degrees and Decimal Minutes (DDM) to Decimal Degrees (DD)  format
            latitude = convertDDMtoDD(
              latitude.slice(0, -1),
              latitude.slice(-1)
            );
            // Converts the longitude from DDM to DD format
            longitude = convertDDMtoDD(
              longitude.slice(0, -1),
              longitude.slice(-1)
            );
            // Add the longitude and latitude data to the internal array
            data.push({ latitude, longitude });
            console.log(data);

            // Emit the longitude and latitude data to the connected clients via Socket.IO
            io.emit("gnss-data", { latitude, longitude });

            // Create a new location instance and save it
            const location = new Location({ latitude, longitude });
            location
              .save()
              .then((result) => {
                console.log("location saved!");
              })
              .catch((error) => {
                console.error("Error saving location:", error);
              });
          } else {
            console.log("Invalid latitude or longitude:", {
              latitude,
              longitude,
            });
          }
        }
      });
    } else {
      console.log("u-blox Device not found");
    }
  })
  .catch((err) => {
    console.error("Error listing ports", err);
  });

// Create a Socket.IO instance and attach it to the Express app, start the server on port 3001
const io = socketIO(app.listen(3001, handleServerStart), {
  cors: {
    origin: "*", // Allow all origins
    methods: ["GET", "POST"], // Allow GET and POST methods
  },
});

// Middleware to handle JSON data in requests
app.use(express.json());

// Serve static files from the 'css' directory
app.use("/css", express.static(path.join(__dirname, "css")));

// Set the view engine for rendering templates (assumed to be EJS in this case)
app.set("view engine", "ejs");

// Array for storing data from the u-blox board
let data = [];

// Route to render the 'data' view
app.get("/", (req, res) => {
  res.render("data");
});

// Route to render the 'mapdata' view
app.get("/map", (req, res) => {
  res.render("mapdata");
});

// Route to render the 'data' from MongoDB
app.get("/data", (req, res) => {
  Location.find({}).then((result) => {
    res.json(result);
  });
});

// Define the locationSchema
const locationSchema = new mongoose.Schema({
  latitude: Number,
  longitude: Number,
});

// Define the Location model
const Location = mongoose.model("Location", locationSchema);

// Callback function to handle server start
function handleServerStart(err) {
  if (err) {
    console.error("Error starting server:", err.message);
  } else {
    console.log("Server listening on port 3001");
  }
}
function convertDDMtoDD(coordinate, direction) {
  // Defines a function to convert coordinates from DDM to DD format
  var splitCoord = coordinate.split("."); // Splits the coordinate into degrees and minutes
  var degrees = parseFloat(splitCoord[0].slice(0, -2)); // Parses the degrees from the coordinate
  var minutes = parseFloat(splitCoord[0].slice(-2) + "." + splitCoord[1]); // Parses the minutes from the coordinate
  var decimalDegrees = degrees + minutes / 60; // Converts the degrees and minutes to decimal degrees

  if (direction === "S" || direction === "W") {
    // Checks if the direction is South or West
    decimalDegrees *= -1; // Negates the decimal degrees if the direction is South or West
  }

  return decimalDegrees; // Returns the decimal degrees
}

// Connect to MongoDB
mongoose.set("strictQuery", false);
mongoose.connect(url);
