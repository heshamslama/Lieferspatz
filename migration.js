// migration.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');

db.serialize(() => {
  // Add new columns to clients table if they don't exist
  db.run(`
    PRAGMA foreign_keys=off;
    BEGIN TRANSACTION;
    
    -- Create temporary clients table with new structure
    CREATE TABLE IF NOT EXISTS clients_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firstName TEXT NOT NULL,
      lastName TEXT,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      password TEXT NOT NULL,
      latitude REAL,
      longitude REAL
    );
    
    -- Copy existing data
    INSERT INTO clients_new (id, firstName, lastName, email, phone, password)
    SELECT id, firstName, lastName, email, phone, password
    FROM clients;
    
    -- Drop old table and rename new one
    DROP TABLE clients;
    ALTER TABLE clients_new RENAME TO clients;
    
    COMMIT;
    PRAGMA foreign_keys=on;
  `, (err) => {
    if (err) {
      console.error('Error migrating clients table:', err);
    } else {
      console.log('Clients table migration completed.');
    }
  });

  // Similar process for restaurants table
  db.run(`
    PRAGMA foreign_keys=off;
    BEGIN TRANSACTION;
    
    CREATE TABLE IF NOT EXISTS restaurants_new (
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
      image TEXT
    );
    
    INSERT INTO restaurants_new (
      id, restaurantName, address, postalCode, city,
      openingTime, closingTime, radius, latitude, longitude,
      email, password
    )
    SELECT 
      id, restaurantName, address, postalCode, city,
      openingTime, closingTime, radius, latitude, longitude,
      email, password
    FROM restaurants;
    
    DROP TABLE restaurants;
    ALTER TABLE restaurants_new RENAME TO restaurants;
    
    COMMIT;
    PRAGMA foreign_keys=on;
  `, (err) => {
    if (err) {
      console.error('Error migrating restaurants table:', err);
    } else {
      console.log('Restaurants table migration completed.');
    }
  });
});