const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const session = require("express-session");
const multer = require("multer");
const app = express();
const fetch = require("node-fetch");

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
})



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

// Serve static files (CSS, images, etc.)
app.use(express.static(path.join(__dirname, "public")));

app.use('/uploads/', express.static(path.join(__dirname, 'uploads')));
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
        category TEXT,
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
        item_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        total_price REAL NOT NULL,
        order_status TEXT DEFAULT 'In Progress',
        order_date_time TEXT,
        order_date_date TEXT,
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
  }
});

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.redirect("/login");
  }
};

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

app.get("/career", (req, res) => {
  res.sendFile(path.join(__dirname, "career.html"));
});

app.get("/contact", (req, res) => {
  res.sendFile(path.join(__dirname, "contact.html"));
});

app.get("/about-us", (req, res) => {
  res.sendFile(path.join(__dirname, "about-us.html"));
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
            // console.log("restaurant.distance: " + restaurant.distance)
           
            // console.log("restaurant.radius: " + restaurant.radius)
            // console.log("distance: " + distance)
            // Return only restaurants that are open and within delivery radius
            return isOpen && (distance <= restaurant.radius);
          });

         
          // Sort restaurants by distance
          availableRestaurants.sort((a, b) => a.distance - b.distance);
          
          // Render the EJS template with the filtered restaurant data
          res.render("client-dashboard", {
            restaurants: availableRestaurants,
            clientName: `${client.firstName} ${client.lastName}`,
            clientBalance : client.balance
          });

        }
      );
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
      [firstName, lastName, email, phone, password , 100.00],
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
        description
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
          0.00,
          description
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
  const { email, password, userType } = req.body;
  console.log("Submitting with:", { email, password, userType });

  // Validate input
  if (!userType || !["client", "restaurant"].includes(userType)) {
    return res.status(400).json({ success: false, message: "Invalid user type." });
  }
  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required." });
  }

  console.log("Attempting login with:", { email, userType });

  // Determine table to query based on user type
  const tableName = userType === "client" ? "clients" : "restaurants";

  // Query the database
  db.get(
    `SELECT * FROM ${tableName} WHERE email = ? AND password = ?`,
    [email, password],
    (err, user) => {
      if (err) {
        console.error(`Database query error (${tableName}):`, err);
        return res.status(500).json({ success: false, message: "Server error. Please try again later." });
      }

      if (user) {
        // Successful login
        req.session.userId = user.id;
        req.session.userType = userType;
        return res.json({
          success: true,
          message: "Login successful.",
          redirect: userType === "client" ? "/client-dashboard" : "/restaurant-dashboard",
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

// Add a route to update restaurant location/details
app.post("/update-restaurant", isAuthenticated, async (req, res) => {
  if (req.session.userType !== "restaurant") {
    return res.status(403).send("Unauthorized");
  }

  try {
    const { address, postalCode, city, radius, openingTime, closingTime } =
      req.body;

    // Get new coordinates from updated address
    const { latitude, longitude } = await getCoordinatesFromAddress(
      address,
      city,
      postalCode
    );

    const query = `
      UPDATE restaurants 
      SET address = ?,
          postalCode = ?,
          city = ?,
          radius = ?,
          openingTime = ?,
          closingTime = ?,
          latitude = ?,
          longitude = ?
      WHERE id = ?
    `;

    db.run(
      query,
      [
        address,
        postalCode,
        city,
        radius,
        openingTime,
        closingTime,
        latitude,
        longitude,
        req.session.userId,
      ],
      (err) => {
        if (err) {
          console.error("Error updating restaurant:", err);
          return res
            .status(500)
            .json({ error: "Failed to update restaurant details" });
        }
        res.json({ success: true });
      }
    );
  } catch (error) {
    console.error("Error updating restaurant location:", error);
    res.status(500).json({ error: "Could not process restaurant location" });
  }
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

app.post(
  "/update-item/:id",
  isAuthenticated,
  upload.single("editImage"),
  (req, res) => {
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

// Restaurant Profile and Menu Route
app.get('/restaurant-profile/:id', (req, res) => {
  const restaurantId = req.params.id;

  // Get client's balance
  db.get('SELECT balance FROM clients WHERE id = ?', [req.session.userId], (err, client) => {
    if (err) {
      return res.status(500).send('Error loading client data');
    }

    if (client) {
      clientBalance = client.balance;
    }

  // Fetch restaurant details
  db.get('SELECT * FROM restaurants WHERE id = ?', [restaurantId], (err, restaurant) => {
      if (err) {
          console.error("Error fetching restaurant details:", err);
          return res.status(500).send("Internal Server Error");
      }

      if (!restaurant) {
          return res.status(404).send("Restaurant not found");
      }

      // Fetch menu items for the restaurant
      db.all('SELECT * FROM menu_items WHERE restaurant_id = ?', [restaurantId], (err, items) => {
          if (err) {
              console.error("Error fetching menu items:", err);
              return res.status(500).send("Internal Server Error");
          }

          // Render the restaurant-profile view with the restaurant and menu items
          res.render('restaurant-profile', { restaurant, items , clientBalance});
      });
    });
  });
});

// 2. Shopping Cart Management
app.post('/cart/add', isAuthenticated, (req, res) => {
  const { restaurantId, itemId, quantity, notes } = req.body;
  
  // Initialize cart if it doesn't exist
  if (!req.session.cart) {
    req.session.cart = {
      restaurantId: null,
      items: [],
      notes: ''
    };
  }
  
  // Check if adding from a different restaurant
  if (req.session.cart.restaurantId && req.session.cart.restaurantId !== parseInt(restaurantId)) {
    return res.status(400).json({
      error: 'Cannot add items from different restaurants to cart'
    });
  }
  
  // Get item details
  db.get('SELECT * FROM menu_items WHERE id = ?', [itemId], (err, item) => {
    if (err || !item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Add to cart
    req.session.cart.restaurantId = parseInt(restaurantId);
    
    // Check if item already exists in cart
    const existingItemIndex = req.session.cart.items.findIndex(i => i.id === parseInt(itemId));
    
    if (existingItemIndex > -1) {
      req.session.cart.items[existingItemIndex].quantity += parseInt(quantity);
    } else {
      req.session.cart.items.push({
        id: item.id,
        name: item.itemName,
        price: item.itemPrice,
        quantity: parseInt(quantity)
      });
    }
    
    if (notes) {
      req.session.cart.notes = notes;
    }
    
    res.json({ 
      success: true, 
      cart: req.session.cart,
      total: calculateCartTotal(req.session.cart.items)
    });
  });
});

// 3. Cart View Route
app.get('/checkout', isAuthenticated, (req, res) => {
  if (!req.session.cart || !req.session.cart.items.length) {
    return res.render('cart', { cart: null });
  }
  
  // Get restaurant details
  db.get('SELECT * FROM restaurants WHERE id = ?', [req.session.cart.restaurantId], (err, restaurant) => {
    if (err) {
      return res.status(500).send('Error loading cart');
    }
    
    // Get client's balance
    db.get('SELECT balance FROM clients WHERE id = ?', [req.session.userId], (err, client) => {
      if (err) {
        return res.status(500).send('Error loading client data');
      }
      
      const total = calculateCartTotal(req.session.cart.items);
      
      res.render('cart', {
        cart: req.session.cart,
        restaurant,
        total,
        clientBalance: client.balance,
        canAfford: client.balance >= total
      });
    });
  });
});

// 4. Place Order Route
app.post('/place-order', isAuthenticated, (req, res) => {
  if (!req.session.cart || !req.session.cart.items.length) {
    return res.status(400).json({ error: 'Cart is empty' });
  }
  
  const total = calculateCartTotal(req.session.cart.items);
  
  // Start transaction
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    try {
      // Check client balance
      db.get('SELECT balance FROM clients WHERE id = ?', [req.session.userId], (err, client) => {
        if (err || !client || client.balance < total) {
          throw new Error('Insufficient funds');
        }
        
        const restaurantShare = Math.round(total * 0.85 * 100) / 100; // 85% to restaurant
        const platformShare = Math.round(total * 0.15 * 100) / 100;   // 15% to platform
        
        // Update client balance
        db.run('UPDATE clients SET balance = balance - ? WHERE id = ?', 
          [total, req.session.userId]);
        
        // Update restaurant balance
        db.run('UPDATE restaurants SET balance = balance + ? WHERE id = ?', 
          [restaurantShare, req.session.cart.restaurantId]);
        
        // Update platform balance
        db.run('UPDATE platform SET balance = balance + ?', [platformShare]);
        
        // Create order records
        const orderDate = new Date();
        req.session.cart.items.forEach(item => {
          db.run(`
            INSERT INTO orders (
              restaurant_id,
              client_id,
              item_name,
              quantity,
              total_price,
              order_status,
              order_date_time,
              order_date_date,
              notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            req.session.cart.restaurantId,
            req.session.userId,
            item.name,
            item.quantity,
            item.price * item.quantity,
            'In Progress',
            orderDate.toLocaleTimeString(),
            orderDate.toLocaleDateString(),
            req.session.cart.notes
          ]);
        });
        
        db.run('COMMIT', (err) => {
          if (err) throw err;
          // Clear cart after successful order
          req.session.cart = null;
          res.json({ success: true, message: 'Order placed successfully' });
        });
      });
    } catch (err) {
      db.run('ROLLBACK');
      console.error('Error placing order:', err);
      res.status(500).json({ error: 'Failed to place order' });
    }
  });
});

// Helper function to calculate cart total
function calculateCartTotal(items) {
  return Math.round(items.reduce((sum, item) => sum + (item.price * item.quantity), 0) * 100) / 100;
}

// Start the server
const port = 3000;
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
