// js/products.js
import { loadSidebar } from './layout.js';

const API_BASE = 'http://localhost:5000/api';

document.addEventListener('DOMContentLoaded', () => {
    loadSidebar();
    fetchInventoryLedger();

    // Bind real-time interactive search and category event handlers
    document.getElementById('inventory-search-input').addEventListener('input', fetchInventoryLedger);
    document.getElementById('inventory-category-select').addEventListener('change', fetchInventoryLedger);
});

async function fetchInventoryLedger() {
    const searchVal = document.getElementById('inventory-search-input').value;
    const catVal = document.getElementById('inventory-category-select').value;
    const tableBody = document.getElementById('inventory-table-body');

    // Build operational parameter parameters
    let endpoint = `${API_BASE}/products?`;
    if (searchVal) endpoint += `search=${encodeURIComponent(searchVal)}&`;
    if (catVal) endpoint += `category=${encodeURIComponent(catVal)}`;

    try {
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error("Could not parse data streams from inventory endpoint.");
        const products = await response.json();

        // 1. EXECUTE HIGH-LEVEL STATUS BAR BALANCING
        calculateInventorySummaryMetrics(products);

        // 2. INJECT RENDERED ROWS
        tableBody.innerHTML = "";
        
        if (products.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-12 text-center text-on-surface-variant/60 font-medium">No inventory allocations match active parameter filters.</td>
                </tr>
            `;
            document.getElementById('table-entries-count-string').innerText = "Showing 0 matches";
            return;
        }

        products.forEach(item => {
            const isOut = item.quantity <= 0;
            const isLow = !isOut && item.quantity <= item.reorder_level;

            // Generate contextual indicator highlights
            let stockDisplayClass = "text-on-surface";
            let statusPill = "";
            let rowBackgroundClass = "hover:bg-surface-container-low/50 transition-colors";

            if (isOut) {
                stockDisplayClass = "text-red-700 font-bold";
                rowBackgroundClass = "bg-red-50/20 hover:bg-red-50/40 transition-colors";
                statusPill = `<span class="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter border border-red-200 ml-2">Depleted</span>`;
            } else if (isLow) {
                stockDisplayClass = "text-amber-700 font-bold";
                statusPill = `<span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter border border-amber-200 ml-2">Low Supply</span>`;
            }

            const row = document.createElement('tr');
            row.className = rowBackgroundClass;
            row.innerHTML = `
                <td class="px-6 py-5 whitespace-nowrap"><span class="monospace text-primary font-bold ${isOut ? 'opacity-40' : ''}">${item.sku}</span></td>
                <td class="px-6 py-5">
                    <p class="font-bold text-on-surface ${isOut ? 'opacity-50 line-through' : ''}">${item.name}</p>
                    <p class="text-xs text-on-surface-variant/70">Per Unit Base Value: $${parseFloat(item.unit_price).toFixed(2)}</p>
                </td>
                <td class="px-6 py-5 text-on-surface-variant">${item.category}</td>
                <td class="px-6 py-5 whitespace-nowrap">
                    <div class="flex items-center gap-1">
                        <span class="monospace text-lg font-bold ${stockDisplayClass}">${item.quantity.toLocaleString()}</span>
                        <span class="text-xs text-on-surface-variant/60 font-medium lowercase ml-0.5">${item.unit}</span>
                        ${statusPill}
                    </div>
                </td>
                <td class="px-6 py-5">
                    <span class="text-label-sm px-2 py-1 bg-surface-container rounded border border-outline-variant text-xs font-semibold">${item.storage_location}</span>
                </td>
                <td class="px-6 py-5 text-right">
                    <div class="flex items-center justify-end gap-2">
                        <button data-id="${item.id}" data-action="decrease" class="stock-nudge-btn w-8 h-8 flex items-center justify-center border border-outline-variant rounded hover:bg-primary hover:text-white hover:border-primary transition-all active:scale-90 bg-white" ${isOut ? 'disabled opacity-30 cursor-not-allowed' : ''}>
                            <span class="material-symbols-outlined text-sm pointer-events-none">remove</span>
                        </button>
                        <button data-id="${item.id}" data-action="increase" class="stock-nudge-btn w-8 h-8 flex items-center justify-center border border-outline-variant rounded hover:bg-primary hover:text-white hover:border-primary transition-all active:scale-90 bg-white">
                            <span class="material-symbols-outlined text-sm pointer-events-none">add</span>
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });

        document.getElementById('table-entries-count-string').innerText = `Showing ${products.length} registered item records in display view matrix.`;
        
        // Dynamic event delegation handler for inline nudge adjustments buttons
        bindStockAdjustmentTriggers();

    } catch (error) {
        console.error("Critical Inventory View Error:", error);
        tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-error font-bold">Failed connecting data pipeline pipelines.</td></tr>`;
    }
}

function calculateInventorySummaryMetrics(productArray) {
    let totalSKUs = productArray.length;
    let lowCount = 0;
    let outCount = 0;

    productArray.forEach(p => {
        if (p.quantity <= 0) outCount++;
        else if (p.quantity <= p.reorder_level) lowCount++;
    });

    document.getElementById('stat-total-skus').innerHTML = `${totalSKUs} <span class="text-body-md font-normal text-on-surface-variant/60 ml-1">Items Loaded</span>`;
    document.getElementById('stat-low-alerts').innerHTML = `${lowCount} <span class="text-body-md font-normal text-amber-700/70 ml-1">SKUs Low</span>`;
    document.getElementById('stat-out-alerts').innerHTML = `${outCount} <span class="text-body-md font-normal text-red-700/70 ml-1">SKUs Depleted</span>`;
}

function bindStockAdjustmentTriggers() {
    document.querySelectorAll('.stock-nudge-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = btn.getAttribute('data-id');
            const action = btn.getAttribute('data-action');
            const adjustmentValue = action === 'increase' ? 1 : -1;

            btn.disabled = true;

            try {
                const response = await fetch(`${API_BASE}/products/${id}/stock`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ adjustment: adjustmentValue })
                });

                if (!response.ok) throw new Error("Database rejected algebraic quantity nudge execution.");
                
                // Re-calculate view state seamlessly without throwing full page reload flash
                await fetchInventoryLedger();

            } catch (error) {
                console.error("Live stock change sync collision:", error);
                alert("Failed adjusting material inventory log item balances directly.");
                btn.disabled = false;
            }
        });
    });
}