import { loadSidebar, setupLogout, showLoader, hideLoader } from './layout.js';

// --- AUTOMATIC ENVIRONMENT DETECTOR ---
let API_BASE;
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    API_BASE = 'http://localhost:5000/api';
} else {
    API_BASE = 'https://technocraft-saas.onrender.com/api';
}
let availableProductsCache = []; 

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

document.addEventListener('DOMContentLoaded', async () => {
    loadSidebar();
    setupDynamicContacts();

    // Set today's date automatically
    const dateInput = document.getElementById('date');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

    await fetchAndPopulateProducts();
    
    // Provide one initial empty row
    appendNewItemRow();

    const addRowBtn = document.getElementById('addRowBtn');
    if (addRowBtn) addRowBtn.addEventListener('click', () => appendNewItemRow());

    const challanForm = document.getElementById('challanForm');
    if (challanForm) challanForm.addEventListener('submit', handleFormSubmit);
});

function setupDynamicContacts() {
    const phoneContainer = document.getElementById('phone-container');
    const emailContainer = document.getElementById('email-container');

    document.addEventListener('click', (e) => {
        if (e.target.closest('.add-phone-btn')) {
            addContactRow(phoneContainer, 'tel', 'party-phone', 'Additional Phone');
        }
        if (e.target.closest('.add-email-btn')) {
            addContactRow(emailContainer, 'email', 'party-email', 'Additional Email');
        }
        if (e.target.closest('.remove-contact-btn')) {
            e.target.closest('.group').remove();
        }
    });

    // Add initial primary rows
    if (phoneContainer) addContactRow(phoneContainer, 'tel', 'party-phone', 'Primary Phone');
    if (emailContainer) addContactRow(emailContainer, 'email', 'party-email', 'Primary Email');
}

function addContactRow(container, type, inputClass, placeholder) {
    const newRow = document.createElement('div');
    newRow.className = "flex items-center gap-2 group animate-slide-down";
    newRow.innerHTML = `
        <input type="${type}" ${type==='tel' ? 'pattern="[0-9+\\\\- ]{10,15}"' : ''} class="${inputClass} flex-grow h-[48px] px-4 bg-gray-50 dark:bg-[#0f0f11] border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-primary dark:focus:ring-blue-500/50 outline-none transition-colors leading-normal" placeholder="${placeholder}">
        <button type="button" class="remove-contact-btn w-12 h-12 shrink-0 bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400 rounded-xl flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors shadow-sm dark:shadow-none" title="Remove">
            <span class="material-symbols-outlined text-[18px]">delete</span>
        </button>
    `;
    container.appendChild(newRow);
}

async function fetchAndPopulateProducts() {
    try {
        const response = await fetch(`${API_BASE}/products`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error("Could not pull warehouse balances.");
        
        availableProductsCache = await response.json();
    } catch (error) {
        console.error("Database initialization fault:", error);
    }
}

function updateDropdownOptions(dropdown) {
    dropdown.innerHTML = '<option value="">Select Item...</option>';
    if (availableProductsCache.length === 0) {
        dropdown.innerHTML = '<option value="">Loading live stock data...</option>';
        return;
    }
    availableProductsCache.forEach(prod => {
        const opt = document.createElement('option');
        opt.value = prod.id;
        opt.innerText = `${prod.name} (Stock: ${prod.quantity})`;
        dropdown.appendChild(opt);
    });
}

function appendNewItemRow() {
    const tbody = document.getElementById('itemsBody');
    if (!tbody) return;

    const row = document.createElement('tr');
    row.className = "item-row-entry hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors animate-slide-down";
    
    row.innerHTML = `
        <td class="p-2 md:p-3">
            <select required class="product-sku-select w-full min-w-[200px] truncate pr-8 bg-gray-50 dark:bg-[#0f0f11] border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-xl h-[46px] px-3 text-sm outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500/50 transition-colors cursor-pointer leading-normal">
                <option value="">Select Item...</option>
            </select>
        </td>
        <td class="p-2 md:p-3">
            <input type="text" placeholder="HSN/SAC" class="product-hsn-input w-full min-w-[100px] px-3 h-[46px] bg-gray-50 dark:bg-[#0f0f11] border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500/50 transition-colors font-mono leading-normal">
        </td>
        <td class="p-2 md:p-3">
            <input type="number" min="1" value="1" required class="product-qty-input w-full min-w-[100px] px-3 h-[46px] bg-gray-50 dark:bg-[#0f0f11] border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-xl text-sm text-right outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500/50 transition-colors font-mono leading-normal">
        </td>
        <td class="p-2 md:p-3">
            <select required class="product-unit-select w-full min-w-[100px] bg-gray-50 dark:bg-[#0f0f11] border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-xl h-[46px] px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500/50 transition-colors cursor-pointer leading-normal">
                <option value="Pcs">Pcs</option>
                <option value="Boxes">Boxes</option>
                <option value="Crates">Crates</option>
            </select>
        </td>
        <td class="p-2 md:p-3">
            <input type="number" step="0.01" min="0" value="0.00" required class="product-rate-input w-full min-w-[100px] px-3 h-[46px] bg-gray-50 dark:bg-[#0f0f11] border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-xl text-sm text-right outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500/50 transition-colors font-mono leading-normal">
        </td>
        <td class="p-2 md:p-3 text-center">
            <button type="button" class="remove-row-trigger w-10 h-10 rounded-xl flex items-center justify-center text-gray-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400 transition-colors mx-auto shadow-sm dark:shadow-none" title="Remove Row">
                <span class="material-symbols-outlined text-[20px]">delete</span>
            </button>
        </td>
    `;

    const selectMenu = row.querySelector('.product-sku-select');
    const rateInput = row.querySelector('.product-rate-input');
    const hsnInput = row.querySelector('.product-hsn-input');
    
    updateDropdownOptions(selectMenu);

    selectMenu.addEventListener('change', (e) => {
        const selectedId = e.target.value;
        if (!selectedId) return;
        const matchedProduct = availableProductsCache.find(p => p.id == selectedId);
        if (matchedProduct) {
            const price = matchedProduct.price || matchedProduct.unit_price || 0;
            rateInput.value = parseFloat(price).toFixed(2);
            hsnInput.value = matchedProduct.hsn_code || ''; 
        }
    });

    row.querySelector('.remove-row-trigger').addEventListener('click', () => {
        const rowCount = tbody.querySelectorAll('.item-row-entry').length;
        if (rowCount > 1) {
            row.remove();
        } else {
            showToast("A transaction requires at least one product.", 'error');
        }
    });

    tbody.appendChild(row);
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> Processing...`;

    // Gather Context & Entity safely
    const type = document.getElementById('type')?.value || 'Out';
    const date = document.getElementById('date')?.value || new Date().toISOString().split('T')[0];
    const orderId = document.getElementById('order_id')?.value.trim() || '';
    const partyName = document.getElementById('party_name')?.value.trim() || '';
    const partyGst = document.getElementById('party_gst')?.value.trim() || '';
    
    const paymentStatus = document.getElementById('status')?.value || 'Pending';
    const logisticsStatus = document.getElementById('logistics_status')?.value || 'Processing';
    const paymentTerms = document.getElementById('payment_terms')?.value || 'Immediate';
    
    const transporter = document.getElementById('transporter')?.value.trim() || '';
    const vehicleNumber = document.getElementById('vehicle_number')?.value.trim() || '';
    const lrNumber = document.getElementById('lr_number')?.value.trim() || '';
    const ewayBill = document.getElementById('eway_bill')?.value.trim() || '';
    const remarks = document.getElementById('remarks')?.value.trim() || '';

    const phoneArray = Array.from(document.querySelectorAll('.party-phone')).map(i => i.value.trim()).filter(v => v !== '');
    const emailArray = Array.from(document.querySelectorAll('.party-email')).map(i => i.value.trim()).filter(v => v !== '');

    if (!partyName) {
        showToast("Entity Name is required.", 'error');
        resetButtonState(submitBtn);
        return;
    }

    const itemRows = document.querySelectorAll('#itemsBody .item-row-entry');
    const aggregatedItems = [];
    let validationFailed = false;

    itemRows.forEach((row, index) => {
        const selectMenu = row.querySelector('.product-sku-select');
        const hsnInput = row.querySelector('.product-hsn-input');
        const quantityInput = row.querySelector('.product-qty-input');
        const unitSelect = row.querySelector('.product-unit-select');
        const rateInput = row.querySelector('.product-rate-input');

        if (selectMenu && selectMenu.value) {
            const productId = parseInt(selectMenu.value);
            const qty = parseInt(quantityInput.value);
            const rate = parseFloat(rateInput.value);

            // --- BUG CATCHER 1: Detect Invalid Product IDs ---
            if (isNaN(productId)) {
                console.error(`🚨 Row ${index + 1} Error: Invalid Product ID detected ("${selectMenu.value}"). It must be an integer.`);
                showToast(`System Error on Row ${index + 1}. Check console.`, 'error');
                validationFailed = true;
                return;
            }

            // --- BUG CATCHER 2: Detect Invalid Quantities ---
            if (isNaN(qty) || qty <= 0) {
                showToast("Quantity must be greater than 0.", 'error');
                validationFailed = true;
                return;
            }

            aggregatedItems.push({
                product_id: productId,
                hsn_code: hsnInput.value.trim(),
                quantity: qty,
                unit_type: unitSelect.value, 
                unit_price: rate || 0
            });
        }
    });

    if (validationFailed) {
        resetButtonState(submitBtn);
        return;
    }

    if (aggregatedItems.length === 0) {
        showToast("Please select at least one item from the inventory log.", 'error');
        resetButtonState(submitBtn);
        return;
    }

    const payload = {
        type: type,
        order_id: orderId,
        date: date,
        party_name: partyName,
        party_type: type === 'Out' ? 'Customer' : 'Vendor',
        party_gst: partyGst,
        party_phones: phoneArray,
        party_emails: emailArray,
        payment_terms: paymentTerms,
        payment_status: paymentStatus,     
        logistics_status: logisticsStatus, 
        transporter: transporter,
        vehicle_number: vehicleNumber,
        lr_number: lrNumber,
        eway_bill: ewayBill,
        remarks: remarks,
        items: aggregatedItems
    };

    // --- BUG CATCHER 3: The Pre-Flight Payload Log ---
    // This prints your exact data to the console before it hits the server.
    console.group("🚀 Pre-Flight Data Check");
    console.log("Master Payload:", payload);
    console.table(payload.items);
    console.groupEnd();

    try {
        const response = await fetch(`${API_BASE}/challans`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "Submission failed.");
        }
        
        showToast("Entry posted successfully!", "success");
        setTimeout(() => window.location.href = 'challan.html', 1500);
        
    } catch (error) {
        // --- BUG CATCHER 4: Enhanced Error Logging ---
        console.error("❌ API Submission Blocked:", error.message);
        showToast(error.message, "error");
        resetButtonState(submitBtn);
    }
}

function showToast(message, type = 'error') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const isError = type === 'error';
    
    toast.className = `flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)] border transform transition-all duration-300 translate-y-10 opacity-0 z-[100] ${
        isError ? 'bg-white dark:bg-[#1a1a1e] border-red-100 dark:border-red-900/30' : 'bg-white dark:bg-[#1a1a1e] border-emerald-100 dark:border-emerald-900/30'
    }`;
    
    const icon = isError ? 'error' : 'check_circle';
    const iconColor = isError ? 'text-red-500 bg-red-50 dark:bg-red-500/10 dark:text-red-400' : 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400';

    toast.innerHTML = `
        <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iconColor}">
            <span class="material-symbols-outlined text-[18px]">${icon}</span>
        </div>
        <p class="text-sm font-bold text-[#1b1b1d] dark:text-gray-100">${message}</p>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function resetButtonState(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">save</span> Post Transaction`;
}
