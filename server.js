const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const app = express();

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));

// Initialize SQLite database
const db = new sqlite3.Database('./users.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database.');
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT,
        password TEXT NOT NULL
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

// Serve the home page with sign up and login buttons
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'home.html'));
});

// Serve the signup page
app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'signup.html'));
});

// Serve the login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Handle signup form submission
app.post('/signup', (req, res) => {
  const { firstName, lastName, email, phone, password } = req.body;

  const query = `INSERT INTO users (firstName, lastName, email, phone, password) VALUES (?, ?, ?, ?, ?)`;
  db.run(query, [firstName, lastName, email, phone, password], function (err) {
    if (err) {
      console.error('Error saving user to database:', err);
      res.status(500).send('Error signing up.');
    } else {
      res.send('Sign up successful!');
    }
  });
});

// Handle login form submission
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  const query = `SELECT * FROM users WHERE email = ? AND password = ?`;
  db.get(query, [email, password], (err, user) => {
    if (err) {
      console.error('Error querying database:', err);
      res.status(500).send('Error logging in.');
    } else if (user) {
      res.send(`Welcome back, ${user.firstName}!`);
    } else {
      res.status(401).send('Invalid email or password.');
    }
  });
});

// Start the server
const port = 3000;
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
