// js/newentry.js
import { loadSidebar } from './layout.js';

const API_BASE = 'http://localhost:5000/api';
let availableProductsCache = []; 

document.addEventListener('DOMContentLoaded', () => {
    loadSidebar();
    
    // 1. Null-Safe Check: Force the date picker to today's date safely if the element exists
    const dateInput = document.getElementById('date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // 2. SAFETY CRITICAL: Render an initial empty row first so the UI never looks broken
    appendNewItemRow();

    // 3. Now fetch the products from the database asynchronously
    fetchAndPopulateProducts();

    // Bind Core Form Events (Perfect Paren Closures Added)
    const addRowBtn = document.getElementById('addRowBtn');
    if (addRowBtn) {
        addRowBtn.addEventListener('click', () => appendNewItemRow());
    }

    const challanForm = document.getElementById('challanForm');
    if (challanForm) {
        challanForm.addEventListener('submit', handleFormSubmit);
    }
});

// Fetches background stock and populates existing + future dropdowns
async function fetchAndPopulateProducts() {
    try {
        const response = await fetch(`${API_BASE}/products`);
        if (!response.ok) throw new Error("Could not pull active warehouse balances.");
        
        availableProductsCache = await response.json();

        const activeDropdowns = document.querySelectorAll('.product-sku-select');
        activeDropdowns.forEach(dropdown => updateDropdownOptions(dropdown));

    } catch (error) {
        console.error("Database connection issue:", error);
        const firstDropdown = document.querySelector('.product-sku-select');
        if (firstDropdown) {
            firstDropdown.innerHTML = `
                <option value="">-- Error Loading Products (Check Server) --</option>
            `;
        }
    }
}

// Helper to push cached products into a specific select menu element
function updateDropdownOptions(dropdown) {
    const previousSelection = dropdown.value;
    dropdown.innerHTML = '<option value="">Select Item</option>';
    
    if (availableProductsCache.length === 0) {
        dropdown.innerHTML = '<option value="">Loading live stock data...</option>';
        return;
    }

    availableProductsCache.forEach(prod => {
        const opt = document.createElement('option');
        opt.value = prod.id;
        opt.innerText = `${prod.name} (Stock: ${prod.quantity})`;
        if (prod.id == previousSelection) opt.selected = true;
        dropdown.appendChild(opt);
    });
}

function appendNewItemRow() {
    const tbody = document.getElementById('itemsBody');
    if (!tbody) return;

    const row = document.createElement('tr');
    row.className = "border-b border-gray-100 item-row-entry";

    row.innerHTML = `
        <td class="p-2">
            <select required class="product-sku-select w-full border-gray-300 rounded-lg text-sm focus:ring-[#4c5b71]">
                <option value="">Select Item</option>
            </select>
        </td>
        <td class="p-2">
            <input type="number" min="1" value="1" required class="product-qty-input w-full border-gray-300 rounded-lg text-sm focus:ring-[#4c5b71]">
        </td>
        <td class="p-2">
            <input type="number" step="0.01" min="0.00" value="0.00" required class="product-rate-input w-full border-gray-300 rounded-lg text-sm focus:ring-[#4c5b71]">
        </td>
        <td class="p-2 text-center">
            <button type="button" class="remove-row-trigger text-red-400 hover:text-red-600 transition-colors text-sm font-bold">✕</button>
        </td>
    `;

    const selectMenu = row.querySelector('.product-sku-select');
    updateDropdownOptions(selectMenu);

    row.querySelector('.remove-row-trigger').addEventListener('click', () => {
        const rowCount = tbody.querySelectorAll('.item-row-entry').length;
        if (rowCount > 1) {
            row.remove();
        } else {
            alert("A valid transaction record requires at least one product line item.");
        }
    });

    tbody.appendChild(row);
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="material-symbols-outlined text-base animate-spin">sync</span> Saving...`;
    }

    const partyName = document.getElementById('party_name').value;
    const type = document.getElementById('type').value;
    const dateElement = document.getElementById('date');
    const date = dateElement ? dateElement.value : new Date().toISOString().split('T')[0];

    const itemRows = document.querySelectorAll('#itemsBody .item-row-entry');
    const aggregatedItems = [];

    itemRows.forEach(row => {
        const selectMenu = row.querySelector('.product-sku-select');
        const quantityInput = row.querySelector('.product-qty-input');
        const rateInput = row.querySelector('.product-rate-input');

        if (selectMenu && selectMenu.value) {
            const unitsCount = parseInt(quantityInput.value) || 0;
            const unitRate = parseFloat(rateInput.value) || 0;
            
            aggregatedItems.push({
                product_id: parseInt(selectMenu.value),
                quantity: unitsCount,
                unit_price: unitRate
            });
        }
    });

    if (aggregatedItems.length === 0) {
        alert("Please allocate at least one inventory item before completing submission.");
        resetButtonState(submitBtn);
        return;
    }

    const transactionPayload = {
        party_name: partyName, 
        type: type,            
        status: "Pending",
        items: aggregatedItems 
    };

    try {
        const response = await fetch(`${API_BASE}/challans`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transactionPayload)
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || `Server error code ${response.status}`);
        }

        alert(`Transaction Ledger Finalized: ${result.challan_number}`);
        window.location.href = 'challan.html';

    } catch (error) {
        console.error("Submission error encountered:", error);
        alert(`Transaction Halted: ${error.message}`);
        resetButtonState(submitBtn);
    }
}

function resetButtonState(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.innerHTML = `<span class="material-symbols-outlined text-base">save</span> Save Transaction`;
}