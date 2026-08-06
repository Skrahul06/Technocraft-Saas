import { loadSidebar, setupLogout, showLoader, hideLoader } from './layout.js';

// --- AUTOMATIC ENVIRONMENT DETECTOR ---
let API_BASE;
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    API_BASE = 'http://localhost:5000/api';
} else {
    API_BASE = 'https://technocraft-saas.onrender.com/api';
}

function getAuthHeaders() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        throw new Error("No authorization token found.");
    }
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

document.addEventListener('DOMContentLoaded', () => {
    loadSidebar();
    fetchInventoryLedger();

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', fetchInventoryLedger);
    }

    // --- MODAL CONTROLS ---
    const modal = document.getElementById('add-product-modal');
    const modalCard = document.getElementById('add-product-card');

    document.getElementById('open-add-product-btn').addEventListener('click', () => {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modalCard.classList.remove('scale-95');
        }, 10);
    });

    document.getElementById('close-product-modal-btn').addEventListener('click', () => {
        modal.classList.add('opacity-0');
        modalCard.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    });

    // --- FORM SUBMIT LOGIC ---
    document.getElementById('add-product-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('save-product-btn');
        btn.disabled = true;
        btn.innerHTML = 'Saving...';

        const payload = {
            name: document.getElementById('new-prod-name').value,
            sku: document.getElementById('new-prod-sku').value,
            category: document.getElementById('new-prod-cat').value,
            hsn_code: document.getElementById('new-prod-hsn').value,
            price: document.getElementById('new-prod-price').value, 
            unit: document.getElementById('new-prod-unit').value,
            reorder_level: document.getElementById('new-prod-reorder').value,
            initial_quantity: document.getElementById('new-prod-qty').value,
            storage_location: document.getElementById('new-prod-location').value
        };

        try {
            const response = await fetch(`${API_BASE}/products`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || "Failed to create product.");
            }

            alert("Product added successfully!");
            document.getElementById('add-product-form').reset();
            document.getElementById('close-product-modal-btn').click();
            
            fetchInventoryLedger(); 
            
        } catch (error) {
            alert(error.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">save</span> Register Product`;
        }
    });
});

async function fetchInventoryLedger() {
    const searchInput = document.getElementById('searchInput');
    const searchVal = searchInput ? searchInput.value : '';
    const tableBody = document.getElementById('inventory-table-body');

    let endpoint = `${API_BASE}/products?`;
    if (searchVal) endpoint += `search=${encodeURIComponent(searchVal)}&`;

    try {
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = 'login.html';
            return;
        }

        if (!response.ok) throw new Error("Could not parse data streams from inventory endpoint.");
        const products = await response.json();

        if (!searchVal) {
            extractAndPopulateCategories(products);
        }

        calculateInventorySummaryMetrics(products);

        tableBody.innerHTML = "";
        
        if (products.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-6 py-12 text-center text-gray-500 dark:text-gray-400 font-medium">No inventory allocations match active parameter filters.</td>
                </tr>
            `;
            document.getElementById('table-entries-count-string').innerText = "Showing 0 matches";
            return;
        }

        products.forEach(item => {
            const isOut = item.quantity <= 0;
            const isLow = !isOut && item.quantity <= (item.reorder_level || 5);

            let stockDisplayClass = "text-gray-900 dark:text-gray-100";
            let statusPill = "";
            let rowBackgroundClass = "hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors border-b border-gray-100 dark:border-gray-800/50";

            if (isOut) {
                stockDisplayClass = "text-red-700 dark:text-red-400 font-bold";
                rowBackgroundClass = "bg-red-50/20 dark:bg-red-500/5 hover:bg-red-50/40 dark:hover:bg-red-500/10 transition-colors border-b border-red-100 dark:border-red-900/30";
                statusPill = `<span class="bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-tighter border border-red-200 dark:border-red-900/50 ml-2">Depleted</span>`;
            } else if (isLow) {
                stockDisplayClass = "text-amber-700 dark:text-amber-400 font-bold";
                statusPill = `<span class="bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-tighter border border-amber-200 dark:border-amber-900/50 ml-2">Low Supply</span>`;
            }

            const row = document.createElement('tr');
            row.className = rowBackgroundClass;
            
            row.innerHTML = `
                <td class="px-6 py-5 whitespace-nowrap"><span class="monospace text-primary dark:text-blue-400 font-bold ${isOut ? 'opacity-40' : ''}">${item.sku}</span></td>
                <td class="px-6 py-5">
                    <p class="font-bold text-gray-800 dark:text-gray-200 ${isOut ? 'opacity-50 line-through' : ''}">${item.name}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Per Unit Base Value: ₹${parseFloat(item.unit_price || item.price || 0).toFixed(2)}</p>
                </td>
                <td class="px-6 py-5 text-gray-600 dark:text-gray-400 font-medium">${item.category || '-'}</td>
                <td class="px-6 py-5 whitespace-nowrap text-right">
                    <div class="flex items-center justify-end gap-1">
                        <span class="monospace text-lg font-bold ${stockDisplayClass}">${(item.quantity || 0).toLocaleString()}</span>
                        <span class="text-[11px] text-gray-500 dark:text-gray-500 font-bold uppercase tracking-wider ml-1">${item.unit || 'PCS'}</span>
                        ${statusPill}
                    </div>
                </td>
                <td class="px-6 py-5 text-right">
                    <span class="text-[11px] px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold uppercase tracking-wider">${item.storage_location || 'WH-MAIN'}</span>
                </td>
            `;
            tableBody.appendChild(row);
        });

        document.getElementById('table-entries-count-string').innerText = `Showing ${products.length} registered item records.`;

    } catch (error) {
        console.error("Critical Inventory View Error:", error);
        tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center text-red-500 dark:text-red-400 font-bold">Failed connecting data pipelines.</td></tr>`;
    }
}

function calculateInventorySummaryMetrics(productArray) {
    let totalSKUs = productArray.length;
    let lowCount = 0;
    let outCount = 0;

    productArray.forEach(p => {
        if (p.quantity <= 0) outCount++;
        else if (p.quantity <= (p.reorder_level || 5)) lowCount++; 
    });

    document.getElementById('stat-total-skus').innerHTML = `${totalSKUs}`;
    document.getElementById('stat-low-alerts').innerHTML = `${lowCount}`;
    document.getElementById('stat-out-alerts').innerHTML = `${outCount}`;
}

// --- DYNAMIC CATEGORY ENGINE ---
function extractAndPopulateCategories(products) {
    const categories = [...new Set(products.map(p => p.category).filter(c => c && c.trim() !== ''))].sort();
    
    const dataList = document.getElementById('category-list');
    
    if (dataList) {
        dataList.innerHTML = '';
        categories.forEach(cat => {
            dataList.innerHTML += `<option value="${cat}">`;
        });
    }
}