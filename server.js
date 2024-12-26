const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const app = express();

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static files (CSS, images, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite database
const db = new sqlite3.Database('./users.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database.');
    
    // Create table if it doesn't exist (removed DROP TABLE)
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        firstName TEXT NOT NULL,
        lastName TEXT,
        email TEXT NOT NULL UNIQUE,
        phone TEXT,
        password TEXT NOT NULL,
        userType TEXT NOT NULL,
        restaurantName TEXT,
        address TEXT,
        postalCode TEXT,
        city TEXT,
        openingTime TEXT,
        closingTime TEXT,
        radius TEXT
      )`,
      (err) => {
        if (err) {
          console.error('Error creating table:', err);
        } else {
          console.log('Users table is ready.');
        }
      }
    );
  }
});

// Routes to serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'start.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'signup.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/menu', (req, res) => {
  res.sendFile(path.join(__dirname, 'menu.html'));
});

app.get('/rest', (req, res) => {
  res.sendFile(path.join(__dirname, 'rest.html'));
});

app.get('/plz', (req, res) => {
  res.sendFile(path.join(__dirname, 'plz.html'));
});

// Serve Client Dashboard
app.get('/client-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'client-dashboard.html')); 
});

// Serve Restaurant Dashboard
app.get('/restaurant-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'restaurant-dashboard.html')); 
});
// Serve Career page
app.get('/career', (req, res) => {
  res.sendFile(path.join(__dirname, 'career.html'));
});

// Serve Contact page
app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'contact.html'));
});

// Serve About Us page
app.get('/about-us', (req, res) => {
  res.sendFile(path.join(__dirname, 'about-us.html'));
});

// Handle signup form submission
app.post('/signup', (req, res) => {
  const { userType } = req.body;

  if (!userType || !['client', 'restaurant'].includes(userType)) {
    return res.status(400).send('Invalid user type.');
  }

  if (userType === 'client') {
    const { firstName, lastName, email, phone, password } = req.body;
    
    const query = `INSERT INTO users (
      firstName, lastName, email, phone, password, userType
    ) VALUES (?, ?, ?, ?, ?, ?)`;
    
    db.run(query, [firstName, lastName, email, phone, password, userType], function(err) {
      if (err) {
        console.error('Error saving user to database:', err);
        return res.status(500).send('Error signing up.');
      }
      console.log('Client sign up successful:', { firstName, lastName });
      return res.redirect('/client-dashboard');
    });
  } 
  else if (userType === 'restaurant') {
    const {restaurantName, address, postalCode, city, openingTime, closingTime, radius, email, password} = req.body;

    const query = `INSERT INTO users (firstName, restaurantName, address, postalCode, city, openingTime, closingTime, radius, email, password, userType) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.run(query, [restaurantName, restaurantName, address, postalCode, city, openingTime, closingTime, radius, email, password, userType], function(err) {
      if (err) {
        console.error('Error saving restaurant to database:', err);
        return res.status(500).send('Error signing up.');
      }
      console.log('Restaurant sign up successful:', { restaurantName, city });
      return res.redirect('/restaurant-dashboard');
    });
  }
});

// // Add this diagnostic route to check database contents
// app.get('/check-users', (req, res) => {
//   db.all(`SELECT email, userType FROM users`, [], (err, users) => {
//     if (err) {
//       console.error('Database query error:', err);
//       return res.status(500).json({ error: 'Database error' });
//     }
//     console.log('All users in database:', users);
//     res.json(users);
//   });
// });

// Handle login form submission
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  
  console.log('Attempting login with:', { email, password });
  
  // First, check if the user exists by email
  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
    if (err) {
      console.error('Database query error:', err);
      return res.status(500).json({ 
        success: false, 
        message: 'Database error during login.' 
      });
    }
    
    if (!user) {
      console.log('No user found with email:', email);
      return res.status(401).json({ 
        success: false, 
        message: 'Email not found.' 
      });
    }
    
    // Now check the password
    if (user.password !== password) {
      console.log('Password mismatch for email:', email);
      return res.status(401).json({ 
        success: false, 
        message: 'Incorrect password.' 
      });
    }

    console.log('Login successful for user:', {
      email: user.email,
      userType: user.userType
    });
    
    if (user.userType === 'client') {
      return res.json({
        success: true,
        redirect: '/client-dashboard'
      });
    } else if (user.userType === 'restaurant') {
      return res.json({
        success: true,
        redirect: '/restaurant-dashboard'
      });
    } else {
      console.log('Invalid user type:', user.userType);
      return res.status(400).json({
        success: false,
        message: 'Invalid user type.'
      });
    }
  });
});
// Start the server
const port = 3000;
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
