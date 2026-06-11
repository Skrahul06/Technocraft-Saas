// js/editentry.js
import { loadSidebar } from './layout.js';

const API_BASE = 'https://technocraft-saas.onrender.com/api';
let availableProductsCache = []; 

// Capture the target string identifier from the URL bar parameters (?id=XXXXXX)
const urlParams = new URLSearchParams(window.location.search);
const editChallanNumberId = urlParams.get('id');

document.addEventListener('DOMContentLoaded', async () => {
    loadSidebar();
    
    // 1. Force background product listings to finish downloading completely FIRST
    await fetchAndPopulateProducts();

    // 2. NOW it is safe to hydrate the form because data models are cached completely
    if (editChallanNumberId) {
        await loadExistingChallanDataForEdit(editChallanNumberId);
    } else {
        console.error("No challan ID found in the URL parameter path.");
    }

    // Bind Event Triggers
    const addRowBtn = document.getElementById('addRowBtn');
    if (addRowBtn) {
        addRowBtn.addEventListener('click', () => appendNewItemRow());
    }

    const challanForm = document.getElementById('challanForm');
    if (challanForm) {
        challanForm.addEventListener('submit', handleEditFormSubmit);
    }
});

// --- FETCH PRODUCT BALANCES CATALOG ---
async function fetchAndPopulateProducts() {
    try {
        const response = await fetch(`${API_BASE}/products`);
        if (!response.ok) throw new Error("Could not pull warehouse balances.");
        availableProductsCache = await response.json();
        
        // Re-force any active dropdowns on screen to render options arrays instantly
        const activeDropdowns = document.querySelectorAll('.product-sku-select');
        activeDropdowns.forEach(dropdown => updateDropdownOptions(dropdown));
    } catch (error) {
        console.error("Database initialization fault:", error);
    }
}

// --- OPTION TAG INJECTOR MATRIX ---
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

// --- PULL TARGET RECORD DETAILS FROM BACKEND ---
async function loadExistingChallanDataForEdit(challanNum) {
    try {
        const response = await fetch(`${API_BASE}/challans/${challanNum}`);
        if (!response.ok) throw new Error("Challan detailed lines could not be loaded.");
        
        const challan = await response.json();

        // Map root properties into master input views positions
        document.getElementById('party_name').value = challan.party_name || '';
        document.getElementById('type').value = challan.type || 'Out';
        
        // Hydrate Status Field
        if (document.getElementById('status')) {
            document.getElementById('status').value = challan.status || 'Pending';
        }
        
        const dateInput = document.getElementById('date');
        if (dateInput && challan.date) {
            dateInput.value = challan.date.split('T')[0];
        }

        // Clear out placeholder layout empty entries completely
        const tbody = document.getElementById('itemsBody');
        if (tbody) tbody.innerHTML = '';

        // Hydrate and reconstruct saved row lines precisely
        if (challan.items && challan.items.length > 0) {
            challan.items.forEach(item => {
                appendNewItemRow(item);
            });
        } else {
            appendNewItemRow();
        }

    } catch (error) {
        console.error("Hydration processing error:", error);
        alert(`Failed loading data parameters: ${error.message}`);
    }
}

// --- ROW BUILDER SUPPORTING PRE-FILLED FORMS ---
function appendNewItemRow(existingItem = null) {
    const tbody = document.getElementById('itemsBody');
    if (!tbody) return;

    const row = document.createElement('tr');
    row.className = "border-b border-gray-100 item-row-entry";

    const defaultQty = existingItem ? existingItem.quantity : 1;
    const defaultRate = existingItem ? existingItem.unit_price : "0.00";

   row.innerHTML = `
    <td class="p-2 align-middle">
        <select required class="product-sku-select w-full border border-gray-300 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-[#4c5b71] outline-none bg-white">
            <option value="">Select Item</option>
        </select>
    </td>
    <td class="p-2 align-middle w-28">
        <input type="number" min="1" value="${defaultQty}" required 
            class="product-qty-input w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-[#4c5b71] outline-none">
    </td>
    <td class="p-2 align-middle w-36">
        <div class="relative flex items-center">
            <input type="number" step="0.01" min="0.00" value="${defaultRate}" required 
                class="product-rate-input w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4c5b71] outline-none">
        </div>
    </td>
    <td class="p-2 align-middle text-center w-12">
        <button type="button" class="remove-row-trigger text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-all text-sm font-bold">
            ✕
        </button>
    </td>
`;

    const selectMenu = row.querySelector('.product-sku-select');
    
    if (existingItem) {
        selectMenu.value = existingItem.product_id;
    }
    
    updateDropdownOptions(selectMenu);

    if (existingItem) {
        selectMenu.value = existingItem.product_id;
    }

    row.querySelector('.remove-row-trigger').addEventListener('click', () => {
        const rowCount = tbody.querySelectorAll('.item-row-entry').length;
        if (rowCount > 1) {
            row.remove();
        } else {
            alert("Editing requires saving at least one active product line row item.");
        }
    });

    tbody.appendChild(row);
}

// --- SUBMIT COMPILATION FOR MODIFICATIONS ---
async function handleEditFormSubmit(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="material-symbols-outlined text-base animate-spin">sync</span> Updating...`;
    }

    const partyName = document.getElementById('party_name').value;
    const type = document.getElementById('type').value;
    const chosenStatus = document.getElementById('status') ? document.getElementById('status').value : 'Pending';
    
    const itemRows = document.querySelectorAll('#itemsBody .item-row-entry');
    const aggregatedItems = [];

    itemRows.forEach(row => {
        const selectMenu = row.querySelector('.product-sku-select');
        const quantityInput = row.querySelector('.product-qty-input');
        const rateInput = row.querySelector('.product-rate-input');

        if (selectMenu && selectMenu.value) {
            aggregatedItems.push({
                product_id: parseInt(selectMenu.value),
                quantity: parseInt(quantityInput.value) || 0,
                unit_price: parseFloat(rateInput.value) || 0
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
        status: chosenStatus, // Dynamically pulled from form field selection menu
        items: aggregatedItems 
    };

    try {
        const response = await fetch(`${API_BASE}/challans/${editChallanNumberId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transactionPayload)
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || `Server update rejected with status code ${response.status}`);
        }

        alert(`Ledger Entry Updated and Synced: ${editChallanNumberId}`);
        window.location.href = 'challan.html';

    } catch (error) {
        console.error("PUT modification script failed:", error);
        alert(`Update Failed: ${error.message}`);
        resetButtonState(submitBtn);
    }
}

function resetButtonState(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.innerHTML = `<span class="material-symbols-outlined text-base">save</span> Update Entry`;
}