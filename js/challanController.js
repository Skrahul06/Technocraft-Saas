// controllers/challanController.js

const API_BASE = 'https://technocraft-saas.onrender.com/api';
const db = require('../config/db'); 

exports.createChallan = async (req, res) => {
    console.log("=== EXECUTING CONTROLLER DATABASE INSERT ===");
    console.log(req.body);

    const { 
        type, challan_number, order_id, date, 
        party_name, party_type, party_gst, party_phones, party_emails, 
        payment_status, logistics_status, payment_terms, transporter, 
        vehicle_number, lr_number, eway_bill, remarks, items 
    } = req.body; 

    try {
        await db.query('BEGIN'); 

        if (!party_name || party_name.trim() === "") {
            return res.status(400).json({ error: "Billed Entity / Party Name field cannot be empty." });
        }
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: "Transaction must include at least one item." });
        }

        // 1. Resolve Party ID safely
        let partyRes = await db.query('SELECT id FROM parties WHERE name = $1', [party_name.trim()]);
        let resolvedPartyId;

        if (partyRes.rows.length > 0) {
            resolvedPartyId = partyRes.rows[0].id;
        } else {
            const contactInfoJSON = JSON.stringify({ gst: party_gst || null, phones: party_phones || [], emails: party_emails || [] });
            const newParty = await db.query(
                'INSERT INTO parties (name, type, contact_info) VALUES ($1, $2, $3) RETURNING id',
                [party_name.trim(), party_type || 'Customer', contactInfoJSON]
            );
            resolvedPartyId = newParty.rows[0].id;
        }

        // 2. Safely calculate Numeric Totals
        let serverCalculatedTotal = 0;
        let netQuantity = 0;
        items.forEach(item => {
            const qty = parseInt(item.quantity) || 0;
            const price = parseFloat(item.unit_price) || 0;
            serverCalculatedTotal += (qty * price);
            netQuantity += qty;
        });

        // 3. Generate ID if not provided
        const countRes = await db.query('SELECT COUNT(*) FROM challans');
        const nextNum = parseInt(countRes.rows[0].count) + 1;
        const finalChallanNumber = challan_number && challan_number.trim() !== '' 
            ? challan_number 
            : `CH-${new Date().getFullYear()}-${String(nextNum).padStart(3, '0')}`;

        // 4. INSERT INTO CHALLANS TABLE (Fully mapped to the new DB Columns)
        const challanRes = await db.query(
            `INSERT INTO challans (
                challan_number, order_id, party_id, type, total_amount, net_quantity, 
                status, logistics_status, date, payment_terms, transporter, vehicle_number, lr_number, eway_bill, remarks
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
            [
                finalChallanNumber, 
                order_id || null, 
                resolvedPartyId, 
                type || 'Out', 
                serverCalculatedTotal, 
                netQuantity, 
                payment_status || 'Pending',     // Protects against Constraint error
                logistics_status || 'Processing', 
                date || new Date().toISOString().split('T')[0],
                payment_terms || 'Immediate', 
                transporter || '', 
                vehicle_number || '', 
                lr_number || '', 
                eway_bill || '', 
                remarks || ''
            ]
        );
        const newChallanId = challanRes.rows[0].id;

        // 5. INSERT ITEMS AND UPDATE WAREHOUSE STOCK
        for (const item of items) {
            const p_id = parseInt(item.product_id);
            const qty = parseInt(item.quantity);
            const price = parseFloat(item.unit_price);
            const hsn = item.hsn_code || '';
            const unit = item.unit_type || 'Pcs';

            const prodRes = await db.query('SELECT quantity, name FROM products WHERE id = $1 FOR UPDATE', [p_id]);
            if (prodRes.rows.length === 0) throw new Error(`Item Reference ID ${p_id} missing.`);

            const currentStock = prodRes.rows[0].quantity;
            let stockAdjustment = (type === 'Out' || type === 'Purchase Return') ? -qty : qty;

            if (stockAdjustment < 0 && currentStock < Math.abs(stockAdjustment)) {
                throw new Error(`Insufficient stock: Only ${currentStock} units available for '${prodRes.rows[0].name}'`);
            }

            await db.query('UPDATE products SET quantity = quantity + $1, last_updated = CURRENT_TIMESTAMP WHERE id = $2', [stockAdjustment, p_id]);

            await db.query(
                `INSERT INTO challan_items (challan_id, item_id, quantity, rate_applied, unit_type, hsn_code) VALUES ($1, $2, $3, $4, $5, $6)`,
                [newChallanId, p_id, qty, price, unit, hsn]
            );
        }

        await db.query('COMMIT'); 
        res.status(201).json({ message: 'Challan recorded successfully.', challan_number: finalChallanNumber });

    } catch (error) {
        await db.query('ROLLBACK'); 
        console.error('SERVER TRANSACTION FAILED:', error.message);
        res.status(400).json({ error: error.message });
    }
};
