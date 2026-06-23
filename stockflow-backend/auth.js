// backend/auth.js
const jwt = require('jsonwebtoken');

// Middleware to protect routes
const authenticate = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Access denied. No token provided." });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Contains id and role
        next();
    } catch (ex) {
        res.status(400).json({ error: "Invalid token." });
    }
};

// Middleware to restrict access to admins only
const authorizeAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: "Access denied. Admin rights required." });
    }
};

module.exports = { authenticate, authorizeAdmin };