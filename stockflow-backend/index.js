// index.js
 //--- TOP OF FILE: Setup & Configuration ---
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Define PORT immediately after importing dotenv
const PORT = process.env.PORT || 5000; 

const db = require('./config/db');
const { authenticate, authorizeAdmin } = require('./auth');
const { logAction } = require('./utils/logger');

const app = express();

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// index.js (Place this after your routes are defined)

// index.js - REFINED AUDIT LOGGING MIDDLEWARE
app.use(async (req, res, next) => {
    // 1. FILTER: (Keep this part, it's efficient)
    const isInventoryRoute = req.originalUrl.includes('/challans') || 
                             req.originalUrl.includes('/products');
    const isWriteOp = ['POST', 'PUT', 'DELETE'].includes(req.method);

    if (!isWriteOp || !isInventoryRoute) return next();

    // 2. INTERCEPT: Wrap BOTH .json and .send
    const originalJson = res.json;
    const originalSend = res.send;

    const auditInterceptor = async (data) => {
        if (res.statusCode < 300 && req.user) {
            // Check if data is the result or just a string
            const resultData = typeof data === 'object' ? data : {};
            const recordId = resultData.id || resultData.challan_number || null;

            await logAction(
                req.user.id, 
                req.method, 
                'challans', // Simplified table name
                recordId, 
                { ...req.body, response_status: res.statusCode }
            );
        }
    };

    res.json = function(data) {
        auditInterceptor(data);
        return originalJson.apply(res, arguments);
    };

    res.send = function(data) {
        auditInterceptor(data);
        return originalSend.apply(res, arguments);
    };

    next();
});
// --- ROUTES ---
app.get('/api/admin/logs', authenticate, authorizeAdmin, async (req, res) => {
    // Default to page 1, show 50 items per page
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;

    try {
        const logs = await db.query(`
            SELECT a.*, u.username 
            FROM audit_logs a 
            LEFT JOIN users u ON a.user_id = u.id 
            ORDER BY a.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]); // Pass limit and offset as parameters
        
        res.json(logs.rows);
    } catch (err) {
        console.error("Error fetching logs:", err);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

   app.post('/api/register', async (req, res) => {
    console.log("Login route hit!");
    console.log("--- REQUEST RECEIVED ---");
    console.log("Headers:", req.headers);
    console.log("Body:", req.body);
    const { username, password, role } = req.body;
    
    // Safety: Ensure password exists before hashing
    if (!password) return res.status(400).json({ error: 'Password is required' });
    
    try {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        
        await db.query(
            'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
            [username, passwordHash, role || 'user']
        );
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        if (error.code === '23505') { // PostgreSQL unique violation code
            return res.status(400).json({ error: 'Username already taken' });
        }
        res.status(500).json({ error: 'Registration failed' });
    }
});
// 2. LOGIN ROUTE
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    const userRes = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userRes.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = userRes.rows[0];

    // Compare provided password with stored hash
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });

    // Generate token
    const token = jwt.sign(
        { id: user.id, role: user.role }, 
        process.env.JWT_SECRET, 
        { expiresIn: '8h' }
    );

    res.json({ token, role: user.role });
});

    // Fetch all Parties (Vendors/Customers)
    app.get('/api/parties', authenticate, authorizeAdmin, async (req, res) => {
        try {
            const result = await db.query('SELECT * FROM parties ORDER BY name ASC');
            res.json(result.rows);
        } catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Fetch all Products (Synced layout targeting your true database table)
    app.get('/api/products', authenticate, async (req, res) => {
        try {
            const { search, category } = req.query;
            let queryStr = 'SELECT * FROM products';
            let params = [];

            if (search || category) {
                queryStr += ' WHERE';
                if (search) {
                    queryStr += ` (sku ILIKE $1 OR name ILIKE $1)`;
                    params.push(`%${search}%`);
                }
                if (category) {
                    if (search) queryStr += ' AND';
                    queryStr += ` category = $${params.length + 1}`;
                    params.push(category);
                }
            }
            
            queryStr += ' ORDER BY sku ASC';
            
            const result = await db.query(queryStr, params);
            res.json(result.rows);
        } catch (error) {
            console.error('Inventory Fetch Core Error:', error);
            res.status(500).json({ error: 'Database pipeline dropped reading inventory logs.' });
        }
    });

    // --- CREATE NEW PRODUCT (INVENTORY MASTER) ---
    app.post('/api/products', authenticate, async (req, res) => {
        const { sku, name, category, price, hsn_code, unit, reorder_level, storage_location, initial_quantity } = req.body;
        
        try {
            if (!sku || !name) throw new Error("SKU Code and Product Name are strictly required.");

            const result = await db.query(
                `INSERT INTO products (
                    sku, name, category, unit_price, hsn_code, unit, 
                    reorder_level, storage_location, quantity, last_updated
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP) RETURNING *`,
                [
                    sku.toUpperCase(), 
                    name, 
                    category || 'Uncategorized', 
                    parseFloat(price) || 0.00, 
                    hsn_code || '', 
                    unit || 'Pcs', 
                    parseInt(reorder_level) || 5, 
                    storage_location || 'WH-MAIN', 
                    parseInt(initial_quantity) || 0
                ]
            );

            res.status(201).json({ message: 'Product successfully registered.', product: result.rows[0] });
        } catch (error) {
            console.error("Product Creation Error:", error);
            if (error.code === '23505') {
                res.status(400).json({ error: 'A product with this SKU already exists in the system.' });
            } else {
                res.status(500).json({ error: error.message || 'Failed to register product.' });
            }
        }
    });

    // Fetch Dashboard KPI & Chart Stats
    app.get('/api/dashboard/stats', authenticate, async (req, res) => {
        try {
            // 1. Current Month Totals
            const currentMonthQuery = `
                SELECT type, COALESCE(SUM(total_amount), 0) as total 
                FROM challans 
                WHERE date >= date_trunc('month', CURRENT_DATE)
                GROUP BY type;
            `;
            const currentRes = await db.query(currentMonthQuery);

            // 2. Previous Month Totals
            const lastMonthQuery = `
                SELECT type, COALESCE(SUM(total_amount), 0) as total 
                FROM challans 
                WHERE date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
                AND date < date_trunc('month', CURRENT_DATE)
                GROUP BY type;
            `;
            const lastRes = await db.query(lastMonthQuery);

            const getTotal = (rows, typeStr) => parseFloat(rows.find(r => r.type === typeStr)?.total || 0);
            
            const calcTrend = (current, previous) => {
                if (previous === 0) return current > 0 ? 100.0 : 0.0;
                return (((current - previous) / previous) * 100).toFixed(1);
            };

            const currentSales = getTotal(currentRes.rows, 'Out');
            const lastSales = getTotal(lastRes.rows, 'Out');
            const currentPurchases = getTotal(currentRes.rows, 'In');
            const lastPurchases = getTotal(lastRes.rows, 'In');
            const currentSalesReturn = getTotal(currentRes.rows, 'Sales Return');
            const lastSalesReturn = getTotal(lastRes.rows, 'Sales Return');
            const currentPurchasesReturn = getTotal(currentRes.rows, 'Purchase Return');
            const lastPurchasesReturn = getTotal(lastRes.rows, 'Purchase Return');

              // 3. Top Consuming Parties (Replaced Top Products)
            const topPartiesQuery = `
                SELECT p.name as party_name, SUM(c.net_quantity) as total_units
                FROM challans c
                JOIN parties p ON c.party_id = p.id
                WHERE c.type = 'Out' AND c.status != 'Cancelled'
                GROUP BY p.name 
                ORDER BY total_units DESC 
                LIMIT 4;
            `;
            const topPartiesRes = await db.query(topPartiesQuery);

            // 4. Sales Trend (Last 7 Days)
            const salesWeeklyQuery = `
                SELECT to_char(date, 'Dy') as label, SUM(total_amount) as total
                FROM challans WHERE type = 'Out' AND date >= CURRENT_DATE - INTERVAL '6 days'
                GROUP BY date, label ORDER BY date ASC;
            `;
            const salesWeeklyRes = await db.query(salesWeeklyQuery);

            // 5. Sales Trend (Monthly)
            const salesMonthlyQuery = `
                SELECT to_char(date, 'Mon') as label, SUM(total_amount) as total
                FROM challans WHERE type = 'Out' AND date >= CURRENT_DATE - INTERVAL '11 months'
                GROUP BY to_char(date, 'Mon'), EXTRACT(MONTH FROM date)
                ORDER BY EXTRACT(MONTH FROM date) ASC;
            `;
            const salesMonthlyRes = await db.query(salesMonthlyQuery);

            // 6. Recent Transactions
        // 6. Recent Transactions (Expanded for Reports)
  // 6. Recent Transactions (Expanded for Reports & Dashboard)
    const recentQuery = `
        SELECT 
            c.challan_number, 
            c.order_id, 
            c.date, 
            p.name as party_name, 
            c.type, 
            c.total_amount, 
            c.net_quantity, 
            c.status 
        FROM challans c
        LEFT JOIN parties p ON c.party_id = p.id
        ORDER BY c.date DESC, c.id DESC
        LIMIT 1000;
    `;
    const recentRes = await db.query(recentQuery);

            // 7. Low Stock Alerts (Updated to reference your products table layout variables!)
            const lowStockQuery = `
                SELECT name, sku, quantity as current_stock 
                FROM products 
                WHERE quantity < 25 
                ORDER BY quantity ASC 
                LIMIT 4;
            `;
            const lowStockRes = await db.query(lowStockQuery);

            res.json({
                kpis: {
                    sales: currentSales, purchases: currentPurchases, 
                    salesReturn: currentSalesReturn, purchaseReturn: currentPurchasesReturn,
                    salesTrend: calcTrend(currentSales, lastSales), 
                    purchaseTrend: calcTrend(currentPurchases, lastPurchases),
                    salesReturnTrend: calcTrend(currentSalesReturn, lastSalesReturn),
                    purchaseReturnTrend: calcTrend(currentPurchasesReturn, lastPurchasesReturn)
                },
                topParties: topPartiesRes.rows,
                salesTrendWeekly: salesWeeklyRes.rows,
                salesTrendMonthly: salesMonthlyRes.rows,
                recentTransactions: recentRes.rows,
                lowStockAlerts: lowStockRes.rows
            });
        } catch (error) {
            console.error('Error fetching stats:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ========================================================
    // CORE DISPATCH: CREATE CHALLAN & TRANSACTION MANAGEMENT
    // ========================================================
// ========================================================
    // CORE DISPATCH: CREATE CHALLAN & TRANSACTION MANAGEMENT
    // ========================================================
    app.post('/api/challans', authenticate, async (req, res) => {
    const { 
        type, challan_number, order_id, date, 
        party_name, party_type, party_gst, party_phones, party_emails, 
        payment_status, logistics_status, payment_terms, transporter, 
        vehicle_number, lr_number, eway_bill, remarks, items 
    } = req.body; 

    try {
        await db.query('BEGIN'); 

        if (!party_name || party_name.trim() === "") throw new Error("Entity cannot be blank.");
        if (!items || items.length === 0) throw new Error("Transaction must include at least one item.");

        // 1. Party Management
        let partyRes = await db.query('SELECT id FROM parties WHERE name = $1', [party_name.trim()]);
        let partyId; 
        if (partyRes.rows.length > 0) {
            partyId = partyRes.rows[0].id;
        } else {
            const contactInfoJSON = JSON.stringify({ gst: party_gst || null, phones: party_phones || [], emails: party_emails || [] });
            const newParty = await db.query(
                'INSERT INTO parties (name, type, contact_info) VALUES ($1, $2, $3) RETURNING id', 
                [party_name.trim(), party_type || (type === 'Out' ? 'Customer' : 'Vendor'), contactInfoJSON]
            );
            partyId = newParty.rows[0].id;
        }

        // 2. Safely Calculate Totals
        let freshlyCalculatedTotal = 0;
        let newlyCalculatedNetQty = 0;
        items.forEach(item => {
            const qty = parseInt(item.quantity);
            const price = parseFloat(item.unit_price);
            if (isNaN(qty) || qty <= 0 || isNaN(price) || price < 0) throw new Error("Invalid quantity or price detected.");
            freshlyCalculatedTotal += (qty * price);
            newlyCalculatedNetQty += qty;
        });

        // 3. Generate Sequential ID
        const countRes = await db.query('SELECT COUNT(*) FROM challans');
        const nextNum = parseInt(countRes.rows[0].count) + 1;
        const finalChallanNumber = challan_number && challan_number.trim() !== '' ? challan_number : `CH-${new Date().getFullYear()}-${String(nextNum).padStart(3, '0')}`;

        // 4. Insert Master Challan Record
        const challanRes = await db.query(
            `INSERT INTO challans (
                challan_number, order_id, party_id, type, total_amount, net_quantity, 
                status, logistics_status, date, payment_terms, transporter, vehicle_number, lr_number, eway_bill, remarks
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
            [
                finalChallanNumber, order_id || null, partyId, type || 'Out', 
                freshlyCalculatedTotal, newlyCalculatedNetQty, 
                payment_status || 'Pending', 
                logistics_status || 'Processing', 
                date || new Date().toISOString().split('T')[0],
                payment_terms || 'Immediate', transporter || '', vehicle_number || '', 
                lr_number || '', eway_bill || '', remarks || ''
            ]
        );
        const newChallanId = challanRes.rows[0].id;

        // 5. Insert Relational Items & Balance Stock
        for (const item of items) {
            const { product_id, quantity, unit_price, unit_type, hsn_code } = item;
            
            if (!product_id || isNaN(parseInt(product_id))) {
                throw new Error("A row contains an invalid or missing product selection.");
            }

            const p_id = parseInt(product_id);
            let stockAdjustment = (type === 'Out' || type === 'Purchase Return') ? -parseInt(quantity) : parseInt(quantity);
            
            const prodCheck = await db.query('SELECT quantity, name FROM products WHERE id = $1 FOR UPDATE', [p_id]);
            if (prodCheck.rows.length === 0) throw new Error(`Product mapping failed. Item missing from database.`);
            
            if (stockAdjustment < 0 && prodCheck.rows[0].quantity < Math.abs(stockAdjustment)) {
                throw new Error(`Insufficient stock for '${prodCheck.rows[0].name}'. Only ${prodCheck.rows[0].quantity} available.`);
            }

            await db.query('UPDATE products SET quantity = quantity + $1 WHERE id = $2', [stockAdjustment, p_id]);
            
            await db.query(
                `INSERT INTO challan_items (challan_id, item_id, quantity, rate_applied, unit_type, hsn_code) VALUES ($1, $2, $3, $4, $5, $6)`,
                [newChallanId, p_id, parseInt(quantity), parseFloat(unit_price), unit_type || 'Pcs', hsn_code || '']
            );
        }

        await db.query('COMMIT'); 
        res.status(201).json({ message: 'Success', challan_number: finalChallanNumber });

    } catch (error) {
        await db.query('ROLLBACK'); 
        res.status(400).json({ error: error.message });
    }
});

    // ==========================================
    // REPORTS ENGINE: Dedicated Ledger Route
    // ==========================================
    app.get('/api/reports/ledger', async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            
            // Parameterized arrays to prevent SQL Injection
            const queryParams = [];
            let dateFilterChallans = '';
            let dateFilterPurchaseRet = '';
            let dateFilterSalesRet = '';

            if (startDate && endDate) {
                // Append exact times to cover the full day bounds
                queryParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
                dateFilterChallans = `WHERE c.date >= $1 AND c.date <= $2`;
                dateFilterPurchaseRet = `WHERE pr.return_date >= $1 AND pr.return_date <= $2`;
                dateFilterSalesRet = `WHERE sr.return_date >= $1 AND sr.return_date <= $2`;
            }

            // We use UNION ALL to merge your standard orders with your new return tables
            // ensuring they output the exact same column names for the frontend.
          // We use UNION ALL to merge orders, returns, and now PAYMENTS!
            const ledgerQuery = `
                SELECT c.date, p.name as party_name, c.type, c.total_amount, c.status, c.logistics_status 
                FROM challans c
                LEFT JOIN parties p ON c.party_id = p.id
                ${dateFilterChallans}

                UNION ALL

                SELECT pr.return_date as date, pr.supplier_id::text as party_name, 'Purchase Return' as type, pr.refund_expected as total_amount, 'Paid' as status, 'Delivered' as logistics_status
                FROM purchase_returns pr
                ${dateFilterPurchaseRet}

                UNION ALL

                SELECT sr.return_date as date, sr.customer_id::text as party_name, 'Sales Return' as type, sr.refund_amount as total_amount, 'Paid' as status, 'Delivered' as logistics_status
                FROM sales_returns sr
                ${dateFilterSalesRet}

                UNION ALL

                SELECT py.payment_date as date, pt.name as party_name, 'Payment ' || py.type as type, py.amount as total_amount, 'Paid' as status, 'Completed' as logistics_status
                FROM payments py
                LEFT JOIN parties pt ON py.party_id = pt.id
                WHERE py.payment_date >= $1 AND py.payment_date <= $2

                ORDER BY date DESC;
            `;

            const result = await db.query(ledgerQuery, queryParams);
            
            // Send the payload back to the Reports UI
            res.json({ ledgerRecords: result.rows });

        } catch (error) {
            console.error('Error compiling ledger report:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // MANUAL STOCK ADJUSTMENT OVERLAY
    app.patch('/api/products/:id/stock', async (req, res) => {
        const { id } = req.params;
        const { adjustment } = req.body;
        try {
            const result = await db.query(
                `UPDATE products SET quantity = quantity + $1, last_updated = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
                [parseInt(adjustment), id]
            );
            if (result.rows.length === 0) return res.status(404).json({ error: 'SKU not found.' });
            res.json({ message: 'Adjusted successfully', item: result.rows[0] });
        } catch (error) {
            res.status(500).json({ error: 'Database error.' });
        }
    });

   
    app.get('/api/challans', async (req, res) => {
        try {
            // Notice we added c.order_id and c.net_quantity here so the table can see them!
            const queryStr = `
                SELECT 
                    c.id, 
                    c.challan_number, 
                    c.order_id, 
                    c.date, 
                    p.name as party_name, 
                    c.type, 
                    c.total_amount, 
                    c.net_quantity, 
                    c.status 
                FROM challans c
                LEFT JOIN parties p ON c.party_id = p.id
                ORDER BY c.date DESC, c.id DESC;
            `;
            const result = await db.query(queryStr);
            res.json(result.rows);
        } catch (error) {
            console.error('Challan Listing Fetch Core Error:', error);
            res.status(500).json({ error: 'Database failed loading ledger records.' });
        }
    });

    // Inside index.js - FETCH A SINGLE CHALLAN WITH ITS DETAILED LINE ITEMS
    app.get('/api/challans/:challan_number', async (req, res) => {
        const { challan_number } = req.params;

        try {
            // 1. Get Master Details (FIXED: Now pulling contact_info for your Print View)
            const masterQuery = `
                SELECT c.*, p.name as party_name, p.contact_info 
                FROM challans c
                LEFT JOIN parties p ON c.party_id = p.id
                WHERE c.challan_number = $1;
            `;
            const masterRes = await db.query(masterQuery, [challan_number]);

            if (masterRes.rows.length === 0) {
                return res.status(404).json({ error: 'Challan record not found.' });
            }

            let challanMaster = masterRes.rows[0];

            // Safely parse the JSON contact info we stored during the POST route
            let parsedContactDetails = {};
            if (challanMaster.contact_info && challanMaster.contact_info !== 'N/A') {
                try {
                    parsedContactDetails = JSON.parse(challanMaster.contact_info);
                } catch (e) {
                    console.error('Could not parse contact info for party:', e);
                }
            }

            // 2. Get All Associated Relational Line Items 
            // FIXED: Joined with the 'products' table to get the actual product name!
            const itemsQuery = `
                SELECT 
                    ci.item_id as product_id, 
                    ci.quantity, 
                    ci.rate_applied as unit_price,
                    pr.name as product_name
                FROM challan_items ci
                LEFT JOIN products pr ON ci.item_id = pr.id
                WHERE ci.challan_id = $1;
            `;
            const itemsRes = await db.query(itemsQuery, [challanMaster.id]);

            // 3. Package them together cleanly for the frontend
            res.json({
                ...challanMaster,
                contact_details: parsedContactDetails, // Appends the GST, Phones, and Emails cleanly
                items: itemsRes.rows 
            });

        } catch (error) {
            console.error('Error fetching single challan detail:', error);
            res.status(500).json({ error: 'Database error while loading entry details.' });
        }
    });
    // ========================================================
    // REENGINEERED: UPDATE CHALLAN & BALANCE INVENTORY BALANCES
    // ========================================================
   // THE UPDATED PUT ROUTE (EDIT EXISTING)
// THE UPDATED PUT ROUTE (EDIT EXISTING)
app.put('/api/challans/:id', authenticate, async (req, res) => {
    const { id } = req.params; 
    
    // FIX 1: We must extract the party details sent from editentry.js
    const { 
        party_name, party_type, party_gst, party_phones, party_emails, 
        type, items, order_id, date, 
        payment_status, logistics_status, payment_terms, transporter, 
        vehicle_number, lr_number, eway_bill, remarks 
    } = req.body; 

    try {
        await db.query('BEGIN'); 

        if (!party_name || party_name.trim() === "") throw new Error("Entity cannot be blank.");
        if (!items || items.length === 0) throw new Error("Transaction must include at least one item.");

        let partyRes = await db.query('SELECT id FROM parties WHERE name = $1', [party_name.trim()]);
        let partyId;
        
        if (partyRes.rows.length > 0) {
            partyId = partyRes.rows[0].id;
        } else {
            // FIX 2: Correctly insert the new party with the required "type" and "contact_info" columns!
            const contactInfoJSON = JSON.stringify({ gst: party_gst || null, phones: party_phones || [], emails: party_emails || [] });
            
            const newParty = await db.query(
                'INSERT INTO parties (name, type, contact_info) VALUES ($1, $2, $3) RETURNING id', 
                [party_name.trim(), party_type || (type === 'Out' ? 'Customer' : 'Vendor'), contactInfoJSON]
            );
            partyId = newParty.rows[0].id;
        }

        const existingChallanRes = await db.query('SELECT id, type FROM challans WHERE challan_number = $1', [id]);
        if (existingChallanRes.rows.length === 0) throw new Error('Challan record not found.');
        
        const challanInternalId = existingChallanRes.rows[0].id;
        const previousTransactionType = existingChallanRes.rows[0].type;

        // Inventory Reversal Matrix
        const oldItemsRes = await db.query('SELECT item_id, quantity FROM challan_items WHERE challan_id = $1', [challanInternalId]);
        for (const oldItem of oldItemsRes.rows) {
            let reversalAdjustment = (previousTransactionType === 'Out' || previousTransactionType === 'Purchase Return') ? oldItem.quantity : -oldItem.quantity; 
            
            const currentProdCheck = await db.query('SELECT quantity, name FROM products WHERE id = $1 FOR UPDATE', [oldItem.item_id]);
            if (currentProdCheck.rows.length > 0) {
                const prodVol = currentProdCheck.rows[0].quantity;
                if (prodVol + reversalAdjustment < 0) {
                    throw new Error(`Undoing previous stock entry leaves '${currentProdCheck.rows[0].name}' in negative balance.`);
                }
            }
            await db.query('UPDATE products SET quantity = quantity + $1 WHERE id = $2', [reversalAdjustment, oldItem.item_id]);
        }

        await db.query('DELETE FROM challan_items WHERE challan_id = $1', [challanInternalId]);

        let freshlyCalculatedTotal = 0;
        let newlyCalculatedNetQty = 0;
        
        items.forEach(item => {
            const qty = parseInt(item.quantity);
            const price = parseFloat(item.unit_price);
            if (qty <= 0 || price < 0) throw new Error("Invalid quantity or price detected.");
            freshlyCalculatedTotal += (qty * price);
            newlyCalculatedNetQty += qty;
        });

        // Save all fields
        await db.query(
            `UPDATE challans 
            SET party_id = $1, type = $2, total_amount = $3, net_quantity = $4, date = $5, order_id = $6,
                status = $7, logistics_status = $8, payment_terms = $9, transporter = $10, 
                vehicle_number = $11, lr_number = $12, eway_bill = $13, remarks = $14
            WHERE id = $15`,
            [
                partyId, type, freshlyCalculatedTotal, newlyCalculatedNetQty, date, order_id,
                payment_status || 'Pending', logistics_status || 'Processing', payment_terms, transporter, 
                vehicle_number, lr_number, eway_bill, remarks, challanInternalId
            ]
        );

        // Re-apply items
        for (const item of items) {
            const { product_id, quantity, unit_price, unit_type, hsn_code } = item;
            let stockAdjustment = (type === 'Out' || type === 'Purchase Return') ? -parseInt(quantity) : parseInt(quantity);
            
            const prodCheck = await db.query('SELECT quantity, name FROM products WHERE id = $1 FOR UPDATE', [product_id]);
            if (stockAdjustment < 0 && prodCheck.rows[0].quantity < Math.abs(stockAdjustment)) {
                throw new Error(`Insufficient stock for '${prodCheck.rows[0].name}'. Only ${prodCheck.rows[0].quantity} left.`);
            }

            await db.query('UPDATE products SET quantity = quantity + $1 WHERE id = $2', [stockAdjustment, product_id]);
            await db.query(
                `INSERT INTO challan_items (challan_id, item_id, quantity, rate_applied, unit_type, hsn_code) VALUES ($1, $2, $3, $4, $5, $6)`,
                [challanInternalId, product_id, parseInt(quantity), parseFloat(unit_price), unit_type || 'Pcs', hsn_code || '']
            );
        }

        await db.query('COMMIT'); 
        res.json({ message: 'Challan updated successfully', challan_number: id });

    } catch (error) {
        await db.query('ROLLBACK'); 
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/challans', authenticate, async (req, res) => {
    try {
        const queryStr = `
            SELECT 
                c.id, c.challan_number, c.order_id, c.date, 
                p.name as party_name, c.type, c.total_amount, c.net_quantity, c.status,
                c.payment_terms, c.transporter, c.vehicle_number, c.lr_number, c.eway_bill, c.remarks
            FROM challans c
            LEFT JOIN parties p ON c.party_id = p.id
            ORDER BY c.date DESC, c.id DESC;
        `;
        const result = await db.query(queryStr);
        res.json(result.rows);
    } catch (error) {
        console.error('Challan Listing Fetch Error:', error);
        res.status(500).json({ error: 'Database failed loading ledger records.' });
    }
});

app.get('/api/challans/:challan_number', authenticate, async (req, res) => {
    const { challan_number } = req.params;

    try {
        const masterQuery = `
            SELECT c.*, p.name as party_name, p.contact_info 
            FROM challans c
            LEFT JOIN parties p ON c.party_id = p.id
            WHERE c.challan_number = $1;
        `;
        const masterRes = await db.query(masterQuery, [challan_number]);

        if (masterRes.rows.length === 0) return res.status(404).json({ error: 'Challan record not found.' });

        let challanMaster = masterRes.rows[0];
        let parsedContactDetails = {};
        if (challanMaster.contact_info && challanMaster.contact_info !== 'N/A') {
            try { parsedContactDetails = JSON.parse(challanMaster.contact_info); } 
            catch (e) { console.error('Could not parse contact info:', e); }
        }

        // UPDATED: Added ci.unit_type and ci.hsn_code to the query
        const itemsQuery = `
            SELECT 
                ci.item_id as product_id, ci.quantity, ci.rate_applied as unit_price,
                ci.unit_type, ci.hsn_code, pr.name as product_name
            FROM challan_items ci
            LEFT JOIN products pr ON ci.item_id = pr.id
            WHERE ci.challan_id = $1;
        `;
        const itemsRes = await db.query(itemsQuery, [challanMaster.id]);

        res.json({
            ...challanMaster,
            contact_details: parsedContactDetails, 
            items: itemsRes.rows 
        });

    } catch (error) {
        res.status(500).json({ error: 'Database error while loading entry details.' });
    }
});

// ==========================================
    // FINANCIAL ENGINE: PAYMENTS & RECEIPTS
    // ==========================================
    app.post('/api/payments', authenticate, async (req, res) => {
        const { party_id, challan_id, type, amount, payment_date, payment_mode, reference_number, remarks } = req.body;

        try {
            if (!party_id || !type || !amount) throw new Error("Missing required financial fields.");
            if (parseFloat(amount) <= 0) throw new Error("Payment amount must be greater than zero.");

            const result = await db.query(
                `INSERT INTO payments (party_id, challan_id, type, amount, payment_date, payment_mode, reference_number, remarks) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                [
                    party_id, 
                    challan_id || null, 
                    type, 
                    parseFloat(amount), 
                    payment_date || new Date().toISOString().split('T')[0], 
                    payment_mode || 'Bank Transfer', 
                    reference_number || '', 
                    remarks || ''
                ]
            );

            res.status(201).json({ message: 'Payment recorded successfully', id: result.rows[0].id });
        } catch (error) {
            console.error('Payment Error:', error);
            res.status(400).json({ error: error.message });
        }
    });

    app.get('/api/payments', authenticate, async (req, res) => {
        try {
            const result = await db.query(`
                SELECT p.*, pt.name as party_name, c.challan_number 
                FROM payments p
                LEFT JOIN parties pt ON p.party_id = pt.id
                LEFT JOIN challans c ON p.challan_id = c.id
                ORDER BY p.payment_date DESC, p.id DESC;
            `);
            res.json(result.rows);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch payments.' });
        }
    });

    // NEW LOGIN ROUTE



    
app.listen(PORT, () => {
    console.log(` server running on port ${PORT}`);
});