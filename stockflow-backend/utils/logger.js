// utils/logger.js
const db = require('../config/db');

const logAction = async (userId, action, table, recordId, businessDetails) => {
    try {
        // We only save the businessDetails (challan_number, party_name, etc.)
        // This keeps the database clean and makes the Audit log UI much faster.
        await db.query(
            `INSERT INTO audit_logs (user_id, action, table_name, record_id, details) 
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, action, table, recordId, JSON.stringify(businessDetails)]
        );
    } catch (err) {
        console.error("Audit log failed:", err);
    }
};

module.exports = { logAction };