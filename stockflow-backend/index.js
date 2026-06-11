// index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Fetch all Parties (Vendors/Customers)
app.get('/api/parties', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM parties ORDER BY name ASC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Fetch all Products (Synced layout targeting your true database table)
app.get('/api/products', async (req, res) => {
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

// Fetch Dashboard KPI & Chart Stats
app.get('/api/dashboard/stats', async (req, res) => {
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

        // 3. Top Selling Products (UPDATED: Changed ci.product_id to ci.item_id)
        const topProductsQuery = `
            SELECT p.name, SUM(ci.quantity) as total_sold 
            FROM challan_items ci 
            JOIN challans c ON ci.challan_id = c.id 
            JOIN products p ON ci.item_id = p.id 
            WHERE c.type = 'Out' 
            GROUP BY p.name ORDER BY total_sold DESC LIMIT 4;
        `;
        const topProductsRes = await db.query(topProductsQuery);

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
const recentQuery = `
    SELECT c.challan_number, c.date, p.name as party_name, c.type, c.total_amount, c.status 
    FROM challans c
    LEFT JOIN parties p ON c.party_id = p.id
    ORDER BY c.date DESC, c.id DESC
    LIMIT 1000; -- Increased so the Reports Engine has data to filter
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
            topProducts: topProductsRes.rows,
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
app.post('/api/challans', async (req, res) => {
    const { party_name, type, status, items } = req.body; 

    try {
        await db.query('BEGIN'); 

        if (!party_name || party_name.trim() === "") {
            throw new Error("Validation Failed: 'party_name' is missing or blank.");
        }

        let partyRes = await db.query('SELECT id FROM parties WHERE name = $1', [party_name.trim()]);
        let resolvedPartyId;

        if (partyRes.rows.length > 0) {
            resolvedPartyId = partyRes.rows[0].id;
        } else {
            const newParty = await db.query(
                'INSERT INTO parties (name, contact_info) VALUES ($1, $2) RETURNING id',
                [party_name.trim(), 'N/A']
            );
            resolvedPartyId = newParty.rows[0].id;
        }

        const countRes = await db.query('SELECT COUNT(*) FROM challans');
        const nextNum = parseInt(countRes.rows[0].count) + 1;
        const generatedChallanNumber = `CH-${new Date().getFullYear()}-${String(nextNum).padStart(3, '0')}`;

        let safeTotalAmount = 0;
        if (items && Array.isArray(items)) {
            items.forEach(item => {
                safeTotalAmount += (parseInt(item.quantity) * parseFloat(item.unit_price));
            });
        }

        // FIXED QUERY ORDER MAPPING: Directly hits your precise column layout coordinates
        const challanRes = await db.query(
            `INSERT INTO challans (challan_number, party_id, type, total_amount, status, date) 
             VALUES ($1, $2, $3, $4, $5, CURRENT_DATE) RETURNING id`,
            [generatedChallanNumber, resolvedPartyId, type, safeTotalAmount, status || 'Pending']
        );
        const newChallanId = challanRes.rows[0].id;

        if (items && Array.isArray(items)) {
            for (const item of items) {
                const { product_id, quantity, unit_price } = item;
                const lineTotal = parseInt(quantity) * parseFloat(unit_price);

                const prodRes = await db.query('SELECT quantity, name FROM products WHERE id = $1', [product_id]);
                if (prodRes.rows.length === 0) {
                    throw new Error("Target component item missing for allocation ID " + product_id);
                }
                
                const currentStock = prodRes.rows[0].quantity;
                const productName = prodRes.rows[0].name;

                let stockAdjustment = 0;
                if (type === 'Out' || type === 'Purchase Return') {
                    if (currentStock < quantity) {
                        throw new Error(`Insufficient stock: Only ${currentStock} units available for '${productName}'`);
                    }
                    stockAdjustment = -parseInt(quantity);
                } else {
                    stockAdjustment = parseInt(quantity);
                }

                await db.query(
                    `UPDATE products SET quantity = quantity + $1, last_updated = CURRENT_TIMESTAMP WHERE id = $2`,
                    [stockAdjustment, product_id]
                );

                await db.query(
                    `INSERT INTO challan_items (challan_id, item_id, quantity, rate_applied)
                     VALUES ($1, $2, $3, $4)`,
                    [
                        newChallanId,           // $1 -> challan_id
                        product_id,             // $2 -> item_id
                        parseInt(quantity),     // $3 -> quantity
                        parseFloat(unit_price)  // $4 -> rate_applied
                    ]
                );
            }
        }

        await db.query('COMMIT'); 
        res.status(201).json({ message: 'Success', challan_number: generatedChallanNumber });

    } catch (error) {
        await db.query('ROLLBACK'); 
        console.error('Core Transaction Engine Fault:', error.message);
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
        const ledgerQuery = `
            SELECT c.date, p.name as party_name, c.type, c.total_amount, c.status 
            FROM challans c
            LEFT JOIN parties p ON c.party_id = p.id
            ${dateFilterChallans}

            UNION ALL

            SELECT pr.return_date as date, pr.supplier_id::text as party_name, 'Purchase Return' as type, pr.refund_expected as total_amount, 'Paid' as status
            FROM purchase_returns pr
            ${dateFilterPurchaseRet}

            UNION ALL

            SELECT sr.return_date as date, sr.customer_id::text as party_name, 'Sales Return' as type, sr.refund_amount as total_amount, 'Paid' as status
            FROM sales_returns sr
            ${dateFilterSalesRet}

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

// UPDATED: Added target route to feed data listings directly into your table view (challan.js)
app.get('/api/challans', async (req, res) => {
    try {
        const queryStr = `
            SELECT c.id, c.challan_number, c.date, p.name as party_name, c.type, c.total_amount, c.status 
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
        // 1. Get Master Details (Joins with parties table to get the text name)
        const masterQuery = `
            SELECT c.*, p.name as party_name 
            FROM challans c
            LEFT JOIN parties p ON c.party_id = p.id
            WHERE c.challan_number = $1;
        `;
        const masterRes = await db.query(masterQuery, [challan_number]);

        if (masterRes.rows.length === 0) {
            return res.status(404).json({ error: 'Challan record not found.' });
        }

        const challanMaster = masterRes.rows[0];

        // 2. Get All Associated Relational Line Items
        const itemsQuery = `
            SELECT item_id as product_id, quantity, rate_applied as unit_price 
            FROM challan_items 
            WHERE challan_id = $1;
        `;
        const itemsRes = await db.query(itemsQuery, [challanMaster.id]);

        // 3. Package them together cleanly for the frontend
        res.json({
            ...challanMaster,
            items: itemsRes.rows // Array of original items
        });

    } catch (error) {
        console.error('Error fetching single challan detail:', error);
        res.status(500).json({ error: 'Database error while loading entry details.' });
    }
});

// ========================================================
// REENGINEERED: UPDATE CHALLAN & BALANCE INVENTORY BALANCES
// ========================================================
app.put('/api/challans/:id', async (req, res) => {
    const { id } = req.params; // The target challan_number string (e.g., 'ch-202442344')
    const { party_name, type, items, status } = req.body; 

    try {
        await db.query('BEGIN'); // Open a safe transactional boundary

        // 1. Resolve or register the corporate business party to get an integer ID
        if (!party_name || party_name.trim() === "") {
            return res.status(400).json({ error: "Billed Entity / Party Name field cannot be left blank." });
        }
        
        let partyRes = await db.query('SELECT id FROM parties WHERE name = $1', [party_name.trim()]);
        let partyId;

        if (partyRes.rows.length > 0) {
            partyId = partyRes.rows[0].id;
        } else {
            const newParty = await db.query(
                'INSERT INTO parties (name, contact_info) VALUES ($1, $2) RETURNING id',
                [party_name.trim(), 'N/A']
            );
            partyId = newParty.rows[0].id;
        }

        // 2. Fetch the existing challan master record to read its history state
        const existingChallanRes = await db.query(
            'SELECT id, type FROM challans WHERE challan_number = $1', 
            [id]
        );
        if (existingChallanRes.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Target Challan record identifier code not found.' });
        }
        
        const challanInternalId = existingChallanRes.rows[0].id;
        const previousTransactionType = existingChallanRes.rows[0].type;

        // 3. INVENTORY REVERSAL MATRIX: Revert previous stock movements before applying new ones
       // Inside app.put('/api/challans/:id') in index.js -> STEP 3

// 3. INVENTORY REVERSAL MATRIX: Revert previous stock movements before applying new ones
const oldItemsRes = await db.query(
    'SELECT item_id, quantity FROM challan_items WHERE challan_id = $1',
    [challanInternalId]
);

for (const oldItem of oldItemsRes.rows) {
    let reversalAdjustment = 0;
    if (previousTransactionType === 'Out' || previousTransactionType === 'Purchase Return') {
        reversalAdjustment = oldItem.quantity; // Put stock back
    } else {
        reversalAdjustment = -oldItem.quantity; // Deduct stock that was added
    }

    // --- SAFETY CHECK CRITICAL FIX ---
    // Look up current stock levels right now before subtracting
    const currentProdCheck = await db.query('SELECT quantity, name FROM products WHERE id = $1', [oldItem.item_id]);
    if (currentProdCheck.rows.length > 0) {
        const prodVol = currentProdCheck.rows[0].quantity;
        const prodName = currentProdCheck.rows[0].name;

        // If reversing this pushes stock below 0, cancel transaction cleanly
        if (prodVol + reversalAdjustment < 0) {
            await db.query('ROLLBACK');
            return res.status(400).json({ 
                error: `Cannot update transaction: Undoing previous stock-in would leave '${prodName}' with a negative balance (${prodVol + reversalAdjustment} units). Add stock first or adjust the current quantities.` 
            });
        }
    }

    await db.query(
        'UPDATE products SET quantity = quantity + $1 WHERE id = $2',
        [reversalAdjustment, oldItem.item_id]
    );
}

        // 4. Purge previous line records safely
        await db.query('DELETE FROM challan_items WHERE challan_id = $1', [challanInternalId]);

        // 5. Force calculate numeric grand total from new items array
        let freshlyCalculatedTotal = 0;
        if (items && Array.isArray(items)) {
            items.forEach(item => {
                freshlyCalculatedTotal += (parseInt(item.quantity) * parseFloat(item.unit_price));
            });
        }

        // 6. Update master ledger values matching column constraints
        await db.query(
            `UPDATE challans 
             SET party_id = $1, type = $2, total_amount = $3, status = $4, date = CURRENT_DATE 
             WHERE id = $5`,
            [partyId, type, freshlyCalculatedTotal, status || 'Pending', challanInternalId]
        );

        // 7. Loop new items to commit stock updates and write relation lines
        if (items && Array.isArray(items)) {
            for (const item of items) {
                const p_id = parseInt(item.product_id);
                const qty = parseInt(item.quantity);
                const price = parseFloat(item.unit_price);

                const prodRes = await db.query('SELECT quantity, name FROM products WHERE id = $1', [p_id]);
                if (prodRes.rows.length === 0) {
                    throw new Error(`Product reference ID ${p_id} missing from system files.`);
                }

                const currentStock = prodRes.rows[0].quantity;
                const productName = prodRes.rows[0].name;

                let stockAdjustment = 0;
                if (type === 'Out' || type === 'Purchase Return') {
                    if (currentStock < qty) {
                        throw new Error(`Insufficient stock for update: Only ${currentStock} units available for '${productName}'`);
                    }
                    stockAdjustment = -qty;
                } else {
                    stockAdjustment = qty;
                }

                // Balance standard inventory counts metrics
                await db.query('UPDATE products SET quantity = quantity + $1 WHERE id = $2', [stockAdjustment, p_id]);

                // Write fresh item rows using exact column properties map: challan_id, item_id, quantity, rate_applied
                await db.query(
                    `INSERT INTO challan_items (challan_id, item_id, quantity, rate_applied)
                     VALUES ($1, $2, $3, $4)`,
                    [challanInternalId, p_id, qty, price]
                );
            }
        }

        await db.query('COMMIT'); // Persist complete relational update smoothly
        res.json({ message: 'Challan updated successfully', challan_number: id });

    } catch (error) {
        await db.query('ROLLBACK'); // Cancel partial updates on safe constraint faults
        console.error('Transactional PUT Engine Error:', error.message);
        res.status(400).json({ error: error.message });
    }
});



app.listen(PORT, () => {
    console.log(` server running on port ${PORT}`);
});