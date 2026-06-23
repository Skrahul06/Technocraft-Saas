// js/createChallan.js
// const API_BASE = 'https://technocraft-saas.onrender.com/api';
const API_BASE = 'http://localhost:5000/api';
let availableItems = [];

// 1. Fetch data on load
async function loadDependencies() {
    try {
        const itemsRes = await fetch(`${API_BASE}/items`);
        availableItems = await itemsRes.json();
        
        const partyRes = await fetch(`${API_BASE}/parties`);
        const parties = await partyRes.json();
        
        const partySelect = document.getElementById('party_id');
        partySelect.innerHTML = '<option value="">Select a Party</option>';
        parties.forEach(p => {
            partySelect.innerHTML += `<option value="${p.id}">${p.name} (${p.type})</option>`;
        });

        addRow(); // Add the first empty row
    } catch (err) {
        console.error("Make sure your backend is running on port 5000!", err);
    }
}

// 2. Add Row Logic
export function addRow() {
    const tbody = document.getElementById('itemsBody');
    const row = document.createElement('tr');
    row.className = 'border-b item-row';
    
    let itemOptions = '<option value="">Select Item</option>';
    availableItems.forEach(item => {
        itemOptions += `<option value="${item.id}">${item.name} (Stock: ${item.current_stock})</option>`;
    });

    row.innerHTML = `
        <td class="p-2"><select class="w-full border-gray-300 rounded text-sm item-select" required>${itemOptions}</select></td>
        <td class="p-2"><input type="number" min="1" class="w-full border-gray-300 rounded text-sm qty-input" value="1" required></td>
        <td class="p-2"><input type="number" step="0.01" min="0" class="w-full border-gray-300 rounded text-sm rate-input" value="0.00" required></td>
        <td class="p-2 text-center"><button type="button" class="text-red-500 hover:text-red-700 font-bold delete-row-btn">X</button></td>
    `;
    
    // Attach delete event listener cleanly
    row.querySelector('.delete-row-btn').addEventListener('click', function() {
        this.closest('tr').remove();
    });

    tbody.appendChild(row);
}

// 3. Submit Transaction Logic
async function handleFormSubmit(e) {
    e.preventDefault(); 

    const items = [];
    document.querySelectorAll('.item-row').forEach(row => {
        const item_id = row.querySelector('.item-select').value;
        const quantity = row.querySelector('.qty-input').value;
        const rate_applied = row.querySelector('.rate-input').value;

        if(item_id) {
            items.push({
                item_id: parseInt(item_id),
                quantity: parseInt(quantity),
                rate_applied: parseFloat(rate_applied)
            });
        }
    });

    const payload = {
        challan_number: document.getElementById('challan_number').value,
        type: document.getElementById('type').value,
        party_id: parseInt(document.getElementById('party_id').value),
        date: document.getElementById('date').value,
        items: items
    };

    try {
        const res = await fetch(`${API_BASE}/challans`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if(res.ok) {
            alert('✅ Challan saved and Inventory Updated!');
            window.location.href = 'challan.html'; 
        } else {
            alert('❌ Error: ' + data.error);
        }
    } catch(err) {
        alert('Server error! Is the backend running?');
    }
}

// Initialize Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    loadDependencies();
    document.getElementById('addRowBtn').addEventListener('click', addRow);
    document.getElementById('challanForm').addEventListener('submit', handleFormSubmit);
});