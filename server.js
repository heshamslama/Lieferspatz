const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const session = require("express-session");
const multer = require("multer");
const app = express();
const fetch = require("node-fetch");
const localTime = new Date().toISOString(); 
const http = require('http');
const socketIo = require('socket.io');
const server = http.createServer(app);
const io = socketIo(server);

// Global socket connection tracking
const connectedRestaurants = {};
io.on('connection', (socket) => {
  // console.log('New socket connection:', socket.id);

  socket.on('register', (restaurantId) => {
    // console.log(`PRECISE LOGGING - Registering restaurant: ${restaurantId}`);
    // console.log(`PRECISE LOGGING - Exact room name: restaurant_${restaurantId}`);
    
    // Trim restaurantId to remove any potential whitespace
    const cleanRestaurantId = String(restaurantId).trim();
    
    // Store socket connection for this restaurant
    connectedRestaurants[cleanRestaurantId] = socket.id;

    // Join a specific room for this restaurant
    socket.join(`restaurant_${cleanRestaurantId}`);
    
    // Verify room joined
    const rooms = Array.from(socket.rooms);
    // console.log('PRECISE LOGGING - Rooms socket is in:', rooms);
  });
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
});

// Add EJS template engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Session configuration
app.use(
  session({
    secret: "your-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // set to true if using HTTPS
  })
);

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.redirect("/login");
  }
};

// Serve static files (CSS, images, etc.)
app.use(express.static(path.join(__dirname, "public")));

app.use("/uploads/", express.static(path.join(__dirname, "uploads")));

// Function to calculate distance between two points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance; // Returns distance in kilometers
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

// geocoding function
async function getCoordinatesFromAddress(address, city, postalCode) {
  const fullAddress = `${address}, ${city} ${postalCode}`;
  try {
    // Using Nominatim OpenStreetMap service for geocoding
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        fullAddress
      )}`
    );
    const data = await response.json();

    if (data && data.length > 0) {
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
      };
    }
    throw new Error("Location not found");
  } catch (error) {
    console.error("Geocoding error:", error);
    throw error;
  }
}
// Initialize SQLite database
const db = new sqlite3.Database("./database.db", (err) => {
  if (err) {
    console.error("Error opening database:", err);
  } else {
    console.log("Connected to SQLite database.");

    // Create Clients table
    db.run(
      `
      CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        firstName TEXT NOT NULL,
        lastName TEXT,
        email TEXT NOT NULL UNIQUE,
        phone TEXT,
        password TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        balance REAL
      )`,
      (err) => {
        if (err && !err.message.includes("duplicate")) {
          console.error("Error adding location columns to clients table:", err);
        } else {
          console.log("Clients table is ready.");
        }
      }
    );

    // Create Restaurants table
    db.run(
      `
      CREATE TABLE IF NOT EXISTS restaurants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        restaurantName TEXT NOT NULL,
        address TEXT NOT NULL,
        postalCode TEXT NOT NULL,
        city TEXT NOT NULL,
        openingTime TEXT NOT NULL,
        closingTime TEXT NOT NULL,
        radius REAL NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        category TEXT DEFAULT 'Restaurant',
        description TEXT,
        image TEXT, 
        balance REAL
      )`,
      (err) => {
        if (err) {
          console.error("Error creating table:", err);
        } else {
          console.log("Restaurants table is ready.");
        }
      }
    );

    // Add new table for menu items
    db.run(
      `
      CREATE TABLE IF NOT EXISTS menu_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        restaurant_id INTEGER,
        itemName TEXT NOT NULL,
        itemPrice REAL NOT NULL,
        image TEXT,
        category TEXT NOT NULL,
        description TEXT,
        FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
      )`,
      (err) => {
        if (err) {
          console.error("Error creating menu_items table:", err);
        } else {
          console.log("Menu items table is ready.");
        }
      }
    );

    // Add new table for orders
    db.run(
      `
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        restaurant_id INTEGER,
        client_id INTEGER,
        items TEXT NOT NULL, 
        total_price REAL NOT NULL,
        order_status TEXT DEFAULT 'In Progress',
        order_date_time TEXT,
        order_date_date TEXT,
        note TEXT, 
        FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
        FOREIGN KEY (client_id) REFERENCES clients(id)
      )`,
      (err) => {
        if (err) {
          console.error("Error creating orders table:", err);
        } else {
          console.log("Orders table is ready.");
        }
      }
    );

    // Add new table for LieferspatzBalance
    db.run(
      `
      CREATE TABLE IF NOT EXISTS LieferspatzBalance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        balance DECIMAL(10, 2) DEFAULT 0.00
      )`,
      (err) => {
        if (err) {
          console.error("Error creating LieferspatzBalance table:", err);
        } else {
          console.log("LieferspatzBalance table is ready.");
        }
      }
    );
  }
});

// Routes for static pages
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "start.html"));
});

app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "signup.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/contact", (req, res) => {
  res.sendFile(path.join(__dirname, "contact.html"));
});

app.get("/about-us", (req, res) => {
  res.sendFile(path.join(__dirname, "about-us.html"));
});

// Signup handler
app.post("/signup", upload.single("image"), async (req, res) => {
  const { userType } = req.body;

  if (!userType || !["client", "restaurant"].includes(userType)) {
    return res.status(400).send("Invalid user type.");
  }

  if (userType === "client") {
    // Existing client signup code remains unchanged
    const { firstName, lastName, email, phone, password } = req.body;
    const query = `INSERT INTO clients (firstName, lastName, email, phone, password , balance) VALUES (?, ?, ?, ?, ?, ?)`;

    db.run(
      query,
      [firstName, lastName, email, phone, password, 100.0],
      function (err) {
        if (err) {
          console.error("Error saving client to database:", err);
          return res.status(500).send("Error signing up.");
        }
        req.session.userId = this.lastID;
        req.session.userType = "client";
        return res.redirect("/client-dashboard");
      }
    );
  } else if (userType === "restaurant") {
    try {
      // Inputs values from the signup form of the restaurant 
      const image = req.file ? req.file.filename : "defaultRestaurantLogo.png";
      const {
        restaurantName,
        address,
        postalCode,
        city,
        openingTime,
        closingTime,
        radius,
        email,
        password,
        description,
      } = req.body;

      // Get coordinates from address
      const { latitude, longitude } = await getCoordinatesFromAddress(
        address,
        city,
        postalCode
      );

      const query = `
        INSERT INTO restaurants (
          restaurantName, 
          address, 
          postalCode, 
          city, 
          openingTime, 
          closingTime, 
          radius, 
          email, 
          password,
          latitude,
          longitude,
          image, 
          balance,
          description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      db.run(
        query,
        [
          restaurantName,
          address,
          postalCode,
          city,
          openingTime,
          closingTime,
          radius,
          email,
          password,
          latitude,
          longitude,
          image,
          0.0,
          description,
        ],
        function (err) {
          if (err) {
            console.error("Error saving restaurant to database:", err);
            return res.status(500).send("Error signing up.");
          }
          req.session.userId = this.lastID;
          req.session.userType = "restaurant";
          return res.redirect("/restaurant-dashboard");
        }
      );
    } catch (error) {
      console.error("Error during restaurant signup:", error);
      return res
        .status(500)
        .send("Error signing up. Could not process restaurant location.");
    }
  }
});

// Login handler
app.post("/login", (req, res) => {
  // Inputs values from the login form
  const { email, password, userType } = req.body;
  console.log("Submitting with:", { email, password, userType });

  // Validate input
  if (!userType || !["client", "restaurant"].includes(userType)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid user type." });
  }
  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, message: "Email and password are required." });
  }

  console.log("Attempting login with:", { email, userType });

  // Clear any existing cart for the previous session
  req.session.cart = [];

  // Determine table to query based on user type
  const tableName = userType === "client" ? "clients" : "restaurants";

  // Query the database
  db.get(
    `SELECT * FROM ${tableName} WHERE email = ? AND password = ?`,
    [email, password],
    (err, user) => {
      if (err) {
        console.error(`Database query error (${tableName}):`, err);
        return res
          .status(500)
          .json({
            success: false,
            message: "Server error. Please try again later.",
          });
      }

      if (user) {
        // Successful login
        req.session.userId = user.id;
        req.session.userType = userType;
        return res.json({
          success: true,
          message: "Login successful.",
          redirect:
            userType === "client"
              ? "/client-dashboard"
              : "/restaurant-dashboard",
        });
      } else {
        // Invalid email or password
        return res.status(401).json({
          success: false,
          message: "Invalid email or password.",
        });
      }
    }
  );
});

// Client dashboard route
app.get("/client-dashboard", isAuthenticated, (req, res) => {
  if (req.session.userType !== "client") {
    return res.redirect("/login");
  }

  // Get the client's info including their location
  db.get(
    "SELECT * FROM clients WHERE id = ?",
    [req.session.userId],
    (err, client) => {
      if (err) {
        console.error("Error fetching client info:", err);
        return res.status(500).send("Database error");
      }

      if (!client) {
        return res.redirect("/login");
      }

      // If client doesn't have location data, we'll need to handle that
      if (!client.latitude || !client.longitude) {
        return res.render("client-dashboard", {
          restaurants: [],
          error: "Please update your location to see available restaurants",
          clientName: `${client.firstName} ${client.lastName}`,
          clientBalance: client.balance.toFixed(2),
        });
      }

      // Get the current time in HH:mm format
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5);

      // Get all restaurants and calculate distances
      db.all(
        `
      SELECT 
        id,
        restaurantName,
        address,
        postalCode,
        city,
        openingTime,
        closingTime,
        radius,
        latitude,
        longitude,
        category,
        COALESCE(description, 'No description available') as description,
        COALESCE(image, 'defaultRestaurantLogo.png') as image
      FROM restaurants
    `,
        [],
        (err, restaurants) => {
          if (err) {
            console.error("Error fetching restaurants:", err);
            return res.status(500).send("Database error");
          }

          // Filter restaurants based on opening hours and delivery radius
          const availableRestaurants = restaurants.filter((restaurant) => {
            const distance = calculateDistance(
              client.latitude,
              client.longitude,
              restaurant.latitude,
              restaurant.longitude
            );
            const isOpen =
              (currentTime >= restaurant.openingTime &&
                currentTime <= restaurant.closingTime) ||
              (restaurant.closingTime < restaurant.openingTime &&
                (currentTime >= restaurant.openingTime ||
                  currentTime <= restaurant.closingTime));

            // Add distance to restaurant object for display purposes
            restaurant.distance = Math.round(distance * 10) / 10; // Round to 1 decimal place

            // Return only restaurants that are open and within delivery radius
            return isOpen && (distance <= restaurant.radius);
          });

          // Sort restaurants by distance
          availableRestaurants.sort((a, b) => a.distance - b.distance);

          // Render the EJS template with the filtered restaurant data
          res.render("client-dashboard", {
            restaurants: availableRestaurants,
            clientBalance: client.balance.toFixed(2),
            clientName: `${client.firstName} ${client.lastName}`,
          });
        }
      );
    }
  );
});

//update client location route 
app.post("/update-location", isAuthenticated, (req, res) => {
  const { latitude, longitude } = req.body;

  if (!latitude || !longitude) {
    return res.status(400).json({ error: "Missing location data" });
  }

  db.run(
    "UPDATE clients SET latitude = ?, longitude = ? WHERE id = ?",
    [latitude, longitude, req.session.userId],
    (err) => {
      if (err) {
        console.error("Error updating client location:", err);
        return res.status(500).json({ error: "Failed to update location" });
      }
      res.json({ success: true });
    }
  );
});

// Restaurant Profile and Menu Route from the Client Side
app.get("/restaurant-profile/:id", isAuthenticated, (req, res) => {
  const restaurantId = req.params.id;

  // First check if user is logged in
  if (!req.session.userId) {
    return res.status(401).send("Please log in to view this page");
  }

  // Get client's balance 
  db.get(
    "SELECT * FROM clients WHERE id = ?",
    [req.session.userId],
    (err, client) => {
      if (err) {
        console.error("Error loading client data:", err);
        return res.status(500).send("Error loading client data");
      }

      if (!client) {
        console.error("Client not found:", req.session.userId);
        return res.status(404).send("Client not found");
      }

      // At this point, we know we have a client with a balance
      const clientBalance = client.balance.toFixed(2);

      // Fetch restaurant details
      db.get(
        "SELECT * FROM restaurants WHERE id = ?",
        [restaurantId],
        (err, restaurant) => {
          if (err) {
            console.error("Error fetching restaurant details:", err);
            return res.status(500).send("Internal Server Error");
          }

          if (!restaurant) {
            return res.status(404).send("Restaurant not found");
          }

          // Fetch menu items for the restaurant
          db.all(
            "SELECT * FROM menu_items WHERE restaurant_id = ?",
            [restaurantId],
            (err, items) => {
              if (err) {
                console.error("Error fetching menu items:", err);
                return res.status(500).send("Internal Server Error");
              }

              // Render the restaurant-profile view with all the data
              res.render("restaurant-profile", {
                restaurant,
                items,
                clientBalance,
                restaurantId: restaurant.id,
                sessionUserId: req.session.userId
              });
            }
          );
        }
      );
    }
  );
});

// Client orders history
app.get("/my-order", isAuthenticated, (req, res) => {
  if (req.session.userType !== "client") {
    return res.redirect("/login");
  }

  // Get client's orders
  db.all(
    `SELECT * FROM orders 
     WHERE client_id = ? 
     ORDER BY order_date_date DESC, order_date_time DESC`,
    [req.session.userId],
    (err, orders) => {
      if (err) {
        console.error("Error fetching orders:", err);
        return res.status(500).send("Database error");
      }

      res.render("my-orders", {
        orders: orders || [],
      });
    }
  );
});

// Restaurant dashboard route
app.get("/restaurant-dashboard", isAuthenticated, (req, res) => {
  if (req.session.userType !== "restaurant") {
    return res.redirect("/login");
  }

  const restaurantId = req.session.userId;

  db.get(
    "SELECT * FROM restaurants WHERE id = ?",
    [restaurantId],
    (err, restaurant) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Database error");
      }

      if (!restaurant) {
        return res.redirect("/login");
      }

      db.all(
        "SELECT * FROM menu_items WHERE restaurant_id = ?",
        [restaurantId],
        (err, items) => {
          if (err) {
            console.error(err);
            return res.status(500).send("Database error");
          }

          db.all(
            "SELECT * FROM orders WHERE restaurant_id = ?",
            [restaurantId],
            (err, orders) => {
              if (err) {
                console.error(err);
                return res.status(500).send("Database error");
              }

              res.render("restaurant-dashboard", {
                restaurantId: restaurant.id,
                restaurantName: restaurant.restaurantName,
                restaurantBalance: restaurant.balance,
                items: items || [],
                orders: orders || [],
              });
            }
          );
        }
      );
    }
  );
});

// Menu item tab in Restaurant dashboard routes
app.post("/add-item", isAuthenticated, upload.single("image"), (req, res) => {
  const { itemName, itemPrice, category, description } = req.body;
  const restaurantId = req.session.userId;
  const image = req.file ? req.file.filename : "defaultItem.png";

  const query = `
    INSERT INTO menu_items (restaurant_id, itemName, itemPrice, image, category, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.run(
    query,
    [restaurantId, itemName, itemPrice, image, category, description],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error adding item");
      }
      res.redirect("/restaurant-dashboard");
    }
  );
});

app.post("/update-item/:id", isAuthenticated, upload.single("editImage"),  (req, res) => {
    const itemId = req.params.id;
    const { editItemName, editItemPrice, editCategory, editDescription } =
      req.body;
    const image = req.file ? req.file.filename : null;

    let query = `
    UPDATE menu_items 
    SET itemName = ?, itemPrice = ?, category = ?, description = ?
    ${image ? ", image = ?" : ""}
    WHERE id = ? AND restaurant_id = ?
  `;

    const params = [editItemName, editItemPrice, editCategory, editDescription];
    if (image) params.push(image);
    params.push(itemId, req.session.userId);

    db.run(query, params, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error updating item");
      }
      res.redirect("/restaurant-dashboard");
    });
  }
);

app.delete("/delete-item/:id", isAuthenticated, (req, res) => {
  const itemId = req.params.id;

  db.run(
    "DELETE FROM menu_items WHERE id = ? AND restaurant_id = ?",
    [itemId, req.session.userId],
    (err) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ success: false, error: "Error deleting item" });
      }
      res.json({ success: true });
    }
  );
});

app.post("/delete-menu", isAuthenticated, (req, res) => {
  db.run(
    "DELETE FROM menu_items WHERE restaurant_id = ?",
    [req.session.userId],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error deleting menu");
      }
      res.redirect("/restaurant-dashboard");
    }
  );
});

app.post("/saveCart", isAuthenticated, async (req, res) => {
  try {
    let { items, note, restaurantId, totalPrice } = req.body;
    const userId = req.session.userId;

    if (!items || items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Cart is empty." });
    }

    totalPrice = parseFloat(totalPrice).toFixed(2);

    const formattedItems = items
      .map((item) => `(${item.count}x ${item.name} | ${item.price} €)`)
      .join("\r\n");

    db.get(
      "SELECT * FROM clients WHERE id = ?",
      [userId],
      (err, client) => {
        if (err) {
          console.error("Error fetching client balance:", err);
          return res
            .status(500)
            .json({
              success: false,
              message: "An error occurred while checking client balance.",
            });
        }

        if (!client || client.balance < totalPrice) {
          return res
            .status(400)
            .json({ success: false, message: "Insufficient funds." });
        }

        db.serialize(() => {
          // Deduct total from client balance
          db.run(
            "UPDATE clients SET balance = balance - ? WHERE id = ?",
            [totalPrice, userId],
            (err) => {
              if (err) {
                console.error("Error updating client balance:", err);
                return res
                  .status(500)
                  .json({
                    success: false,
                    message: "An error occurred while updating client balance.",
                  });
              }
            }
          );

          // Add full amount to LieferspatzBalance
          db.run(
            `INSERT INTO LieferspatzBalance (id, balance)
           VALUES (1, ?)
           ON CONFLICT (id) 
           DO UPDATE SET balance = balance + excluded.balance`,
            [totalPrice],
            (err) => {
              if (err) {
                console.error(
                  "Error updating LieferspatzBalance balance:",
                  err
                );
                return res
                  .status(500)
                  .json({
                    success: false,
                    message:
                      "An error occurred while updating LieferspatzBalance balance.",
                  });
              }
            }
          );

          // Insert the order into the database
          db.run(
            `INSERT INTO orders (restaurant_id, client_id, items, total_price, order_status, order_date_time, order_date_date, note)
             VALUES (?, ?, ?, ?, 'In Progress', datetime('now', 'localtime'), date('now', 'localtime'), ?)`,
            [restaurantId, userId, formattedItems, totalPrice, note],
            function (err) {
              if (err) {
                console.error("Error saving order:", err);
                return res.status(500).json({
                  success: false,
                  message: "An error occurred while saving the order.",
                });
              }
        
              // Send real-time notification
              const orderDetails = {
                orderId: this.lastID,
                items: formattedItems,
                totalPrice: totalPrice,
                orderDateTime: new Date(),
                note: note,
                order_status: 'In Progress'
              };
        
              // Broadcast to the specific restaurant room
              io.to(`restaurant_${restaurantId.toString().trim()}`).emit('newOrder', orderDetails);
              // console.log('newOrder event emitted to:', `restaurant_${restaurantId}`, orderDetails);

        
              res.json({ success: true, message: "Order placed successfully!" });
            }
          );
        });
      }
    );
  } catch (error) {
    console.error("Error in /saveCart route:", error);
    res
      .status(500)
      .json({ success: false, message: "An unexpected error occurred." });
  }
});

// Order routes
app.put("/update-order-status/:id", isAuthenticated, (req, res) => {
  const orderId = req.params.id;
  const { newStatus } = req.body;

  db.run(
    "UPDATE orders SET order_status = ? WHERE id = ? AND restaurant_id = ?",
    [newStatus, orderId, req.session.userId],
    (err) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ success: false, error: "Error updating order status" });
      }
      res.json({ success: true });
    }
  );
});

app.post("/confirmOrder", isAuthenticated, (req, res) => {
  const { orderId } = req.body;

  db.get(
    "SELECT * FROM orders WHERE id = ?",
    [orderId],
    (err, order) => {
      if (err || !order) {
        console.error("Error fetching order:", err);
        return res
          .status(500)
          .json({
            success: false,
            message: "An error occurred while fetching the order.",
          });
      } 

      const restaurantShare = parseFloat((order.total_price * 0.85).toFixed(2));

      db.serialize(() => {
        // Deduct 85% from LieferspatzBalance
        db.run(
          "UPDATE LieferspatzBalance SET balance = balance - ? WHERE id = 1",
          [restaurantShare],
          (err) => {
            if (err) {
              console.error("Error updating LieferspatzBalance balance:", err);
              return res
                .status(500)
                .json({
                  success: false,
                  message:
                    "An error occurred while updating LieferspatzBalance balance.",
                });
            }
          }
        );

        // Add 85% to restaurant's balance
        db.run(
          "UPDATE restaurants SET balance = balance + ? WHERE id = ?",
          [restaurantShare, order.restaurant_id],
          (err) => {
            if (err) {
              console.error("Error updating restaurant balance:", err);
              return res
                .status(500)
                .json({
                  success: false,
                  message:
                    "An error occurred while updating restaurant balance.",
                });
            }

            // Update order status
            db.run(
              "UPDATE orders SET order_status = ? WHERE id = ?",
              ["Confirmed", orderId],
              (err) => {
                if (err) {
                  console.error("Error updating order status:", err);
                  return res
                    .status(500)
                    .json({
                      success: false,
                      message:
                        "An error occurred while updating the order status.",
                    });
                }

                res.json({
                  success: true,
                  message: "Order confirmed successfully!",
                });
              }
            );
          }
        );
      });
    }
  );
});

app.post("/refuseOrder", isAuthenticated, (req, res) => {
  const { orderId } = req.body;

  db.get(
    "SELECT * FROM orders WHERE id = ?",
    [orderId],
    (err, order) => {
      if (err || !order) {
        console.error("Error fetching order:", err);
        return res
          .status(500)
          .json({
            success: false,
            message: "An error occurred while fetching the order.",
          });
      }

      db.serialize(() => {
        // Refund the total price to the client
        db.run(
          "UPDATE clients SET balance = balance + ? WHERE id = ?",
          [order.total_price.toFixed(2), order.client_id],
          (err) => {
            if (err) {
              console.error("Error updating client balance:", err);
              return res
                .status(500)
                .json({
                  success: false,
                  message: "An error occurred while refunding the client.",
                });
            }

            // Update order status
            db.run(
              "UPDATE orders SET order_status = ? WHERE id = ?",
              ["Refused", orderId],
              (err) => {
                if (err) {
                  console.error("Error updating order status:", err);
                  return res
                    .status(500)
                    .json({
                      success: false,
                      message:
                        "An error occurred while updating the order status.",
                    });
                }

                res.json({
                  success: true,
                  message: "Order refused and refunded successfully!",
                });
              }
            );
          }
        );
      });
    }
  );
});

// Signout route
app.get("/signout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).send("Error signing out.");
    }
    res.redirect("/");
  });
});

// Start the server
const port = 3000;
server.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
