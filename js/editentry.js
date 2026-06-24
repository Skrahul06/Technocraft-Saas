// js/editentry.js
import { loadSidebar } from './layout.js';

const API_BASE = 'https://technocraft-saas.onrender.com/api';
//const API_BASE = 'http://localhost:5000/api';
let availableProductsCache = []; 

const urlParams = new URLSearchParams(window.location.search);
const editChallanNumberId = urlParams.get('id');

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
    
    await fetchAndPopulateProducts();

    if (editChallanNumberId) {
        await loadExistingChallanDataForEdit(editChallanNumberId);
    } else {
        console.error("No challan ID found in the URL.");
        showToast("Error: No Challan ID provided for editing.", "error");
    }

    const addRowBtn = document.getElementById('addRowBtn');
    if (addRowBtn) addRowBtn.addEventListener('click', () => appendNewItemRow());

    const challanForm = document.getElementById('challanForm');
    if (challanForm) challanForm.addEventListener('submit', handleEditFormSubmit);
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
}

function addContactRow(container, type, inputClass, placeholder, value = '') {
    const newRow = document.createElement('div');
    newRow.className = "flex items-center gap-2 group animate-slide-down";
    newRow.innerHTML = `
        <input type="${type}" ${type==='tel' ? 'pattern="[0-9+\\\\- ]{10,15}"' : ''} value="${value}" class="${inputClass} flex-grow h-[48px] px-4 bg-gray-50 dark:bg-[#0f0f11] border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-primary dark:focus:ring-blue-500/50 outline-none transition-colors leading-normal" placeholder="${placeholder}">
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

        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = 'login.html';
            return;
        }

        if (!response.ok) throw new Error("Could not pull warehouse balances.");
        
        availableProductsCache = await response.json();
        document.querySelectorAll('.product-sku-select').forEach(dropdown => updateDropdownOptions(dropdown));
    } catch (error) {
        console.error("Database initialization fault:", error);
    }
}

function updateDropdownOptions(dropdown) {
    const previousSelection = dropdown.value;
    dropdown.innerHTML = '<option value="">Select Item...</option>';
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

async function loadExistingChallanDataForEdit(challanNum) {
    try {
        const response = await fetch(`${API_BASE}/challans/${challanNum}`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error("Challan details could not be loaded.");
        const challan = await response.json();

        if(document.getElementById('type')) document.getElementById('type').value = challan.type || 'Out';
        if(document.getElementById('challan_number')) document.getElementById('challan_number').value = challan.challan_number || '';
        if(document.getElementById('order_id')) document.getElementById('order_id').value = challan.order_id || '';
        if(document.getElementById('date') && challan.date) document.getElementById('date').value = challan.date.split('T')[0];

        if(document.getElementById('party_name')) document.getElementById('party_name').value = challan.party_name || '';
        if(document.getElementById('party_gst')) document.getElementById('party_gst').value = challan.party_gst || '';
        if(document.getElementById('payment_terms')) document.getElementById('payment_terms').value = challan.payment_terms || 'Immediate';
        
        if(document.getElementById('status')) document.getElementById('status').value = challan.status || 'Pending';
        if(document.getElementById('logistics_status')) document.getElementById('logistics_status').value = challan.logistics_status || 'Processing';

        if(document.getElementById('transporter')) document.getElementById('transporter').value = challan.transporter || '';
        if(document.getElementById('vehicle_number')) document.getElementById('vehicle_number').value = challan.vehicle_number || '';
        if(document.getElementById('lr_number')) document.getElementById('lr_number').value = challan.lr_number || '';
        if(document.getElementById('eway_bill')) document.getElementById('eway_bill').value = challan.eway_bill || '';
        if(document.getElementById('remarks')) document.getElementById('remarks').value = challan.remarks || '';

        const phoneContainer = document.getElementById('phone-container');
        const emailContainer = document.getElementById('email-container');
        phoneContainer.innerHTML = '';
        emailContainer.innerHTML = '';

        const phones = challan.party_phones || [];
        if (phones.length === 0) addContactRow(phoneContainer, 'tel', 'party-phone', 'Primary Phone');
        else phones.forEach(p => addContactRow(phoneContainer, 'tel', 'party-phone', 'Phone Number', p));

        const emails = challan.party_emails || [];
        if (emails.length === 0) addContactRow(emailContainer, 'email', 'party-email', 'Primary Email');
        else emails.forEach(e => addContactRow(emailContainer, 'email', 'party-email', 'Email Address', e));

        const tbody = document.getElementById('itemsBody');
        tbody.innerHTML = '';
        if (challan.items && challan.items.length > 0) {
            challan.items.forEach(item => appendNewItemRow(item));
        } else {
            appendNewItemRow(); 
        }
    } catch (error) {
        console.error("Hydration error:", error);
        showToast("Error loading challan data.", "error");
    }
}

function appendNewItemRow(existingItem = null) {
    const tbody = document.getElementById('itemsBody');
    if (!tbody) return;

    const row = document.createElement('tr');
    row.className = "item-row-entry hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors animate-slide-down";
    
    const unitType = existingItem?.unit_type || 'Pcs';

    row.innerHTML = `
        <td class="p-2 md:p-3">
            <select required class="product-sku-select w-full min-w-[200px] truncate pr-8 bg-gray-50 dark:bg-[#0f0f11] border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-xl h-[46px] px-3 text-sm outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500/50 transition-colors cursor-pointer leading-normal">
                <option value="">Select Item...</option>
            </select>
        </td>
        <td class="p-2 md:p-3">
            <input type="text" placeholder="HSN/SAC" value="${existingItem?.hsn_code || ''}" class="product-hsn-input w-full min-w-[100px] px-3 h-[46px] bg-gray-50 dark:bg-[#0f0f11] border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500/50 transition-colors font-mono leading-normal">
        </td>
        <td class="p-2 md:p-3">
            <input type="number" min="1" value="${existingItem?.quantity || 1}" required class="product-qty-input w-full min-w-[100px] px-3 h-[46px] bg-gray-50 dark:bg-[#0f0f11] border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-xl text-sm text-right outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500/50 transition-colors font-mono leading-normal">
        </td>
        <td class="p-2 md:p-3">
            <select required class="product-unit-select w-full min-w-[100px] bg-gray-50 dark:bg-[#0f0f11] border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-xl h-[46px] px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500/50 transition-colors cursor-pointer leading-normal">
                <option value="Pcs" ${unitType === 'Pcs' ? 'selected' : ''}>Pcs</option>
                <option value="Boxes" ${unitType === 'Boxes' ? 'selected' : ''}>Boxes</option>
                <option value="Crates" ${unitType === 'Crates' ? 'selected' : ''}>Crates</option>
            </select>
        </td>
        <td class="p-2 md:p-3">
            <input type="number" step="0.01" min="0" value="${existingItem?.unit_price || '0.00'}" required class="product-rate-input w-full min-w-[100px] px-3 h-[46px] bg-gray-50 dark:bg-[#0f0f11] border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-xl text-sm text-right outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500/50 transition-colors font-mono leading-normal">
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
    if (existingItem) selectMenu.value = existingItem.product_id;

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

    row.querySelector('.remove-row-trigger').addEventListener('click', () => row.remove());
    tbody.appendChild(row);
}

async function handleEditFormSubmit(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> Updating...`;

    // FIX: Using Optional Chaining to prevent "cannot read property value of null" errors
    const type = document.getElementById('type')?.value || 'Out';
    const date = document.getElementById('date')?.value || '';
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

    const rawRows = Array.from(document.querySelectorAll('#itemsBody .item-row-entry'));
    const aggregatedItems = [];
    let validationFailed = false;

    for (const row of rawRows) {
        const selectVal = row.querySelector('.product-sku-select').value;
        if (!selectVal) continue; 

        const qty = parseInt(row.querySelector('.product-qty-input').value);
        const rate = parseFloat(row.querySelector('.product-rate-input').value);

        if (isNaN(qty) || qty <= 0 || isNaN(rate) || rate < 0) {
            showToast("Invalid quantity or unit price detected.", 'error');
            validationFailed = true;
            break;
        }

        aggregatedItems.push({
            product_id: parseInt(selectVal),
            hsn_code: row.querySelector('.product-hsn-input').value.trim(),
            quantity: qty,
            unit_type: row.querySelector('.product-unit-select').value, 
            unit_price: rate
        });
    }

    if (validationFailed) {
        resetButtonState(submitBtn);
        return;
    }

    if (aggregatedItems.length === 0) {
        showToast("Please select at least one valid item.", 'error');
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

    try {
        const response = await fetch(`${API_BASE}/challans/${editChallanNumberId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || `Update failed (${response.status})`);
        }
        showToast("Entry updated successfully!", "success");
        setTimeout(() => window.location.href = 'challan.html', 1500);
    } catch (error) {
        showToast(error.message, "error");
        resetButtonState(submitBtn);
    }
}

function showToast(message, type = 'error') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    const isError = type === 'error';
    toast.className = `flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.08)] border transform transition-all duration-300 translate-y-10 opacity-0 z-[100] ${isError ? 'bg-white dark:bg-[#1a1a1e] border-red-100 dark:border-red-900/30' : 'bg-white dark:bg-[#1a1a1e] border-emerald-100 dark:border-emerald-900/30'}`;
    const icon = isError ? 'error' : 'check_circle';
    const iconColor = isError ? 'text-red-500 bg-red-50 dark:bg-red-500/10 dark:text-red-400' : 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400';
    toast.innerHTML = `<div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iconColor}"><span class="material-symbols-outlined text-[18px]">${icon}</span></div><p class="text-sm font-bold text-[#1b1b1d] dark:text-gray-100">${message}</p>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.remove('translate-y-10', 'opacity-0'));
    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function resetButtonState(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.innerHTML = `Update Entry`;
}
