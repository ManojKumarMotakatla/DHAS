const mysql = require("mysql2");

// Create connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "manoj",        // put your MySQL password if you have
    database: "health_app",
    port:3307
});

// Connect to database
db.connect((err) => {
    if (err) {
        console.log("Database connection failed:", err.message
        );
    } else {
        console.log("Connected to MySQL database");
    }
});

module.exports = db;