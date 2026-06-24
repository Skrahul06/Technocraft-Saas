// js/payments.js
import { loadSidebar } from './layout.js';

const API_BASE = 'https://technocraft-saas.onrender.com/api';
//const API_BASE = 'http://localhost:5000/api';

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
    
    // Theme setup
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
            localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
        });
    }

    // Set today's date
    document.getElementById('payment_date').value = new Date().toISOString().split('T')[0];

    // Load Parties
    try {
        const res = await fetch(`${API_BASE}/parties`, { headers: getAuthHeaders() });
        const parties = await res.json();
        const select = document.getElementById('party_id');
        select.innerHTML = '<option value="">Select Entity...</option>';
        parties.forEach(p => {
            select.innerHTML += `<option value="${p.id}">${p.name}</option>`;
        });
    } catch (e) {
        console.error("Failed loading parties", e);
    }

    // Handle Submit
    document.getElementById('paymentForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('submitBtn');
        btn.disabled = true;
        btn.innerText = 'Saving...';

        const payload = {
            type: document.querySelector('input[name="payment_type"]:checked').value,
            party_id: document.getElementById('party_id').value,
            amount: document.getElementById('amount').value,
            payment_date: document.getElementById('payment_date').value,
            payment_mode: document.getElementById('payment_mode').value,
            reference_number: document.getElementById('reference_number').value
        };

        try {
            const response = await fetch(`${API_BASE}/payments`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || "Failed to save payment.");
            }
            
            alert("Payment recorded successfully!");
            document.getElementById('paymentForm').reset();
            document.getElementById('payment_date').value = new Date().toISOString().split('T')[0];
        } catch (error) {
            alert(error.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">account_balance_wallet</span> Save Transaction`;
        }
    });
});
