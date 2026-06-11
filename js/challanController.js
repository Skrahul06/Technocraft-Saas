// controllers/challanController.js
const db = require('../config/db'); // Ensure this points to your pool/client connection file

exports.createChallan = async (req, res) => {
    // 1. Log incoming payload variables to check names
    console.log("=== EXECUTING CONTROLLER DATABASE INSERT ===");
    console.log(req.body);

    const { party_name, type, items, status } = req.body;

    try {
        await db.query('BEGIN'); // Open safe transaction boundary

        // 2. Resolve party name string safely to an integer ID
        if (!party_name || party_name.trim() === "") {
            return res.status(400).json({ error: "Billed Entity / Party Name field cannot be empty." });
        }

        let partyRes = await db.query('SELECT id FROM parties WHERE name = $1', [party_name.trim()]);
        let resolvedPartyId;

        if (partyRes.rows.length > 0) {
            resolvedPartyId = partyRes.rows[0].id;
        } else {
            const newParty = await db.query(
                'INSERT INTO parties (name, contact_info) VALUES ($1, $2) RETURNING id',
                [party_name.trim(), 'Auto-Generated Profile']
            );
            resolvedPartyId = newParty.rows[0].id;
        }

        // 3. Generate dynamic sequence tag text numbers
        const countRes = await db.query('SELECT COUNT(*) FROM challans');
        const nextNum = parseInt(countRes.rows[0].count) + 1;
        const generatedChallanNumber = `CH-${new Date().getFullYear()}-${String(nextNum).padStart(3, '0')}`;

        // 4. Force calculate numeric total on server side to prevent NaN string leaks
        let serverCalculatedTotal = 0;
        if (items && Array.isArray(items)) {
            items.forEach(item => {
                const qty = parseInt(item.quantity) || 0;
                const price = parseFloat(item.unit_price) || 0;
                serverCalculatedTotal += (qty * price);
            });
        }

        // 5. CRITICAL FIX: Explicitly specify table column mappings to override position shifting!
        const challanRes = await db.query(
            `INSERT INTO challans (challan_number, party_id, type, total_amount, status, date) 
             VALUES ($1, $2, $3, $4, $5, CURRENT_DATE) RETURNING id`,
            [
                generatedChallanNumber,   // $1 always hits challan_number text
                resolvedPartyId,          // $2 always hits party_id integer
                type,                     // $3 always hits type text
                serverCalculatedTotal,    // $4 always hits total_amount numeric
                status || 'Pending'       // $5 always hits status text
            ]
        );
        const newChallanId = challanRes.rows[0].id;

        // 6. Loop and adjust individual physical stock allocations
        if (items && Array.isArray(items)) {
            for (const item of items) {
                const p_id = parseInt(item.product_id);
                const qty = parseInt(item.quantity);
                const price = parseFloat(item.unit_price);

                if (!p_id || !qty) {
                    throw new Error("Invalid format in transaction item row details.");
                }

                const prodRes = await db.query('SELECT quantity, name FROM products WHERE id = $1', [p_id]);
                if (prodRes.rows.length === 0) {
                    throw new Error(`Item Reference ID ${p_id} missing from system files.`);
                }

                const currentStock = prodRes.rows[0].quantity;
                const productName = prodRes.rows[0].name;

                let stockAdjustment = 0;
                if (type === 'Out' || type === 'Purchase Return') {
                    if (currentStock < qty) {
                        throw new Error(`Insufficient stock: Only ${currentStock} units available for '${productName}'`);
                    }
                    stockAdjustment = -qty;
                } else {
                    stockAdjustment = qty;
                }

                // Balance product inventory counts
                await db.query('UPDATE products SET quantity = quantity + $1 WHERE id = $2', [stockAdjustment, p_id]);

                // Record line details
                await db.query(
                    `INSERT INTO challan_items (challan_id, product_id, quantity, unit_price, line_total)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [newChallanId, p_id, qty, price, (qty * price)]
                );
            }
        }

        await db.query('COMMIT'); // Safe commit confirmation
        res.status(201).json({ message: 'Challan recorded successfully.', challan_number: generatedChallanNumber });

    } catch (error) {
        await db.query('ROLLBACK'); // Cancel changes on validation failure
        console.error('SERVER TRANSACTION FAILED:', error.message);
        res.status(400).json({ error: error.message });
    }
};