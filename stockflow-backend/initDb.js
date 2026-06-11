// initDb.js
const db = require('./config/db');

const createTablesSql = `
    -- 1. Parties Table
    CREATE TABLE IF NOT EXISTS parties (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL CHECK (type IN ('Vendor', 'Customer')),
        contact_info TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Items / Inventory Table
    CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        sku VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        current_stock INT DEFAULT 0 CHECK (current_stock >= 0),
        unit_price DECIMAL(12, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. Challans Master Table
    CREATE TABLE IF NOT EXISTS challans (
        id SERIAL PRIMARY KEY,
        challan_number VARCHAR(100) UNIQUE NOT NULL,
        type VARCHAR(50) NOT NULL CHECK (type IN ('In', 'Out')),
        party_id INT REFERENCES parties(id) ON DELETE RESTRICT,
        date DATE DEFAULT CURRENT_DATE,
        total_amount DECIMAL(12, 2) DEFAULT 0.00,
        status VARCHAR(50) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Paid', 'Cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. Challan Items Junction Table
    CREATE TABLE IF NOT EXISTS challan_items (
        id SERIAL PRIMARY KEY,
        challan_id INT REFERENCES challans(id) ON DELETE CASCADE,
        item_id INT REFERENCES items(id) ON DELETE RESTRICT,
        quantity INT NOT NULL CHECK (quantity > 0),
        rate_applied DECIMAL(12, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`;

async function initializeDatabase() {
    try {
        console.log('🔄 Creating database tables if they do not exist...');
        await db.query(createTablesSql);
        console.log('✅ All relational tables created successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error executing database schema setup:', error);
        process.exit(1);
    }
}

initializeDatabase();