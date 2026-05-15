const mysql = require("mysql2");

// Create connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "VYSHUNANI",        // put your MySQL password if you have
    database: "dhas_db",
    port:3306
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