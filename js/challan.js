// js/challan.js
import { loadSidebar } from './layout.js';

const API_BASE = 'http://localhost:5000/api';
let allChallans = []; 

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
    fetchData();
    setupEventListeners();
});

async function fetchData() {
    const tbody = document.getElementById('challans-body');
    try {
        const response = await fetch(`${API_BASE}/challans`, { headers: getAuthHeaders() });
        if (!response.ok) throw new Error(`Server returned status code ${response.status}`);
        
        allChallans = await response.json(); 
        renderTable(allChallans);
    } catch (error) {
        console.error("Error fetching data:", error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-red-500 dark:text-red-400 font-semibold">Failed to connect to backend server. ${error.message}</td></tr>`;
        }
    }
}

function renderTable(data) {
    const tbody = document.getElementById('challans-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-10 text-center text-gray-500 dark:text-gray-400">No records found.</td></tr>`;
        return;
    }

    data.forEach(c => {
        const id = c.challan_number || c.challan_id || c.id || 'N/A';
        const orderId = c.order_id || '-'; 
        const date = new Date(c.date || c.issue_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
        const party = c.party_name || c.client || c.customer_entity || 'Unknown Entity';
        const quantity = new Intl.NumberFormat('en-IN').format(c.net_quantity || c.quantity || 0);

        // Uses Logistics Status for the Main Board
        const status = c.logistics_status || c.status || 'Processing';
        let statusClass = "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700";
        if (status === 'Delivered') {
            statusClass = "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50";
        } else if (status === 'Dispatched' || status === 'In Transit') {
            statusClass = "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-400 border-blue-200 dark:border-blue-900/50";
        } else if (status === 'Processing') {
            statusClass = "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400 border-amber-200 dark:border-amber-900/50";
        }
        const statusPill = `<span class="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md border ${statusClass}">${status}</span>`;

        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors group border-b border-gray-100 dark:border-gray-800/50 text-gray-900 dark:text-gray-300 text-sm";
        
        tr.innerHTML = `
            <td class="py-4 px-6 text-left font-mono font-bold w-[12%] truncate dark:text-gray-100">#${id}</td>
            <td class="py-4 px-6 text-left text-gray-500 dark:text-gray-400 font-mono w-[12%] truncate">${orderId}</td>
            <td class="py-4 px-4 text-left text-gray-500 dark:text-gray-400 whitespace-nowrap w-[12%]">${date}</td>
            <td class="py-4 px-6 text-left min-w-0 w-[22%]">
                <span class="font-bold text-gray-800 dark:text-gray-200 truncate block max-w-[200px]" title="${party}">${party}</span>
            </td>
            <td class="py-4 px-6 text-left w-[14%] whitespace-nowrap">${statusPill}</td>
            <td class="py-4 px-6 text-right font-mono font-bold text-gray-900 dark:text-gray-100 w-[13%]">${quantity}</td>
            <td class="py-4 px-6 text-center print-hidden w-[15%]">
                <div class="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button data-action="view" data-id="${id}" class="p-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-500/20 hover:text-blue-600 dark:hover:text-blue-400 text-gray-400 dark:text-gray-500 transition-colors cursor-pointer" title="View Document">
                        <span class="material-symbols-outlined text-[18px]">visibility</span>
                    </button>
                    <button data-action="edit" data-id="${id}" class="p-1.5 rounded-md hover:bg-amber-50 dark:hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 text-gray-400 dark:text-gray-500 transition-colors cursor-pointer" title="Edit Record">
                        <span class="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button data-action="print" data-id="${id}" class="p-1.5 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 text-gray-400 dark:text-gray-500 transition-colors cursor-pointer" title="Print Challan">
                        <span class="material-symbols-outlined text-[18px]">print</span>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    attachActionListeners();
}

function setupEventListeners() {
    const searchInput = document.getElementById('headerSearchInput') || document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allChallans.filter(c => {
                const id = (c.challan_number || c.challan_id || c.id || '').toLowerCase();
                const orderId = (c.order_id || '').toLowerCase();
                const party = (c.party_name || c.client || c.customer_entity || '').toLowerCase();
                return id.includes(term) || party.includes(term) || orderId.includes(term);
            });
            renderTable(filtered);
        });
    }

    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshBtn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> Syncing...`;
            fetchData().then(() => {
                setTimeout(() => {
                    refreshBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">sync</span> Refresh`;
                }, 500);
            });
        });
    }

    const exportCsvBtn = document.getElementById('export-csv-btn');
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => {
            if (!allChallans || allChallans.length === 0) return alert("No data to export.");
            
            let csv = "Challan ID,Order ID,Issue Date,Customer Entity,Status,Payment Terms,Transporter,Net Quantity\n";
            allChallans.forEach(c => {
                const id = c.challan_number || c.challan_id || c.id || '';
                const orderId = c.order_id || '';
                const date = new Date(c.date || c.issue_date).toLocaleDateString('en-IN');
                const party = c.party_name || c.client || c.customer_entity || '';
                const status = c.logistics_status || c.status || 'Processing';
                const terms = c.payment_terms || '-';
                const transporter = c.transporter || '-';
                const quantity = c.net_quantity || c.quantity || 0;
                csv += `"${id}","${orderId}","${date}","${party}","${status}","${terms}","${transporter}","${quantity}"\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `Technocraft_Logistics_Export_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    const modalCloseBtn = document.getElementById('modal-close-btn');
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeViewModal);

    const modalPrintBtn = document.getElementById('modal-print-btn');
    if (modalPrintBtn) modalPrintBtn.addEventListener('click', () => window.print());
}

function attachActionListeners() {
    document.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.currentTarget.dataset.action;
            const id = e.currentTarget.dataset.id;
            
            if (action === 'view') openViewModal(id);
            if (action === 'print') {
                openViewModal(id);
                setTimeout(() => window.print(), 300);
            }
            if (action === 'edit') {
                window.location.href = `edit-challan.html?id=${id}`;
            }
        });
    });
}

async function openViewModal(id) {
    let record = allChallans.find(c => (c.challan_number === id || c.challan_id === id || c.id === id));
    
    if (!record || !record.items) {
        try {
            const res = await fetch(`${API_BASE}/challans/${id}`, { headers: getAuthHeaders() });
            if (res.ok) record = await res.json();
        } catch (e) {
            console.error("Failed to load deep challan details", e);
        }
    }

    if (!record) return;

    const modal = document.getElementById('view-modal');
    const printArea = document.getElementById('print-area');
    if (!modal || !printArea) return;

    const date = new Date(record.date || record.issue_date).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' });
    const orderId = record.order_id || '-';
    const party = record.party_name || record.client || record.customer_entity || 'Unknown Entity';
    const gst = record.party_gst || 'Not Provided';
    const terms = record.payment_terms || 'Immediate';
    const transporter = record.transporter || 'Self / Direct';
    const vehicle = record.vehicle_number || '-';
    const lrNo = record.lr_number || '-';
    const eway = record.eway_bill || '-';
    const remarks = record.remarks || 'None';

    let itemsHtml = '';
    let totalQty = 0;
    
    (record.items || []).forEach((item, index) => {
        const qty = parseInt(item.quantity) || 0;
        const price = parseFloat(item.unit_price) || 0.00;
        const total = qty * price;
        totalQty += qty;

        itemsHtml += `
            <tr class="border-b border-gray-100 dark:border-gray-800 transition-colors">
                <td class="py-3 px-4 text-sm text-gray-800 dark:text-gray-200 font-semibold">${index + 1}</td>
                <td class="py-3 px-4 text-sm text-gray-800 dark:text-gray-200 font-semibold">${item.product_name || `Item #${item.product_id}`}</td>
                <td class="py-3 px-4 text-sm text-gray-500 dark:text-gray-400 font-mono">${item.hsn_code || '-'}</td>
                <td class="py-3 px-4 text-sm text-gray-800 dark:text-gray-200 text-right font-mono font-bold">${qty}</td>
                <td class="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">${item.unit_type || 'Pcs'}</td>
                <td class="py-3 px-4 text-sm text-gray-800 dark:text-gray-200 text-right font-mono">₹${price.toFixed(2)}</td>
                <td class="py-3 px-4 text-sm text-gray-900 dark:text-gray-100 text-right font-mono font-bold">₹${total.toFixed(2)}</td>
            </tr>
        `;
    });

    if (itemsHtml === '') {
        itemsHtml = `<tr><td colspan="7" class="py-6 text-center text-sm text-gray-500">Line items attached to secure backend ledger.</td></tr>`;
    }

    printArea.innerHTML = `
        <div class="flex flex-col gap-8 w-full text-gray-900 dark:text-gray-100 max-w-5xl mx-auto">
            
            <div class="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-gray-200 dark:border-gray-800 pb-6">
                <div>
                    <h1 class="text-3xl font-black tracking-tighter uppercase text-primary dark:text-blue-400 leading-none mb-2">
                        Technocraft
                    </h1>
                    <p class="text-sm font-bold text-gray-500 dark:text-gray-400 tracking-widest uppercase">Delivery Challan</p>
                    <p class="text-xs text-gray-500 dark:text-gray-500 mt-2 leading-relaxed">
                        123 Tech Park, Logistics Suite 400<br/>Salt Lake City, Kolkata, WB 700091<br/>GSTIN: 19ABCDE1234F1Z5
                    </p>
                </div>
                
                <div class="flex flex-col items-start sm:items-end gap-2 text-sm w-full sm:w-auto">
                    <div class="bg-gray-50 dark:bg-[#222226] border border-gray-200 dark:border-gray-700 px-4 py-3 rounded-xl flex flex-col w-full sm:min-w-[220px]">
                        <span class="text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 tracking-wider">Challan No.</span>
                        <span class="font-mono text-lg font-bold text-gray-900 dark:text-gray-100">#${id}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-x-6 gap-y-1 mt-2 w-full text-left sm:text-right">
                        <span class="text-xs font-bold text-gray-400">Date:</span>
                        <span class="text-xs font-bold text-gray-800 dark:text-gray-200">${date}</span>
                        <span class="text-xs font-bold text-gray-400">Ref Order:</span>
                        <span class="text-xs font-bold text-gray-800 dark:text-gray-200">${orderId}</span>
                        <span class="text-xs font-bold text-gray-400">Terms:</span>
                        <span class="text-xs font-bold text-primary dark:text-blue-400">${terms}</span>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="bg-gray-50 dark:bg-[#222226] p-5 rounded-2xl border border-gray-200 dark:border-gray-800">
                    <span class="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-2">Billed To Entity</span>
                    <h3 class="text-lg font-extrabold text-gray-900 dark:text-gray-100 leading-tight mb-2">${party}</h3>
                    <div class="space-y-1 text-sm">
                        <p class="flex justify-between"><span class="text-gray-500">GSTIN:</span> <span class="font-mono font-bold text-gray-700 dark:text-gray-300">${gst}</span></p>
                    </div>
                </div>

                <div class="bg-gray-50 dark:bg-[#222226] p-5 rounded-2xl border border-gray-200 dark:border-gray-800">
                    <span class="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-2">Dispatch Details</span>
                    <div class="grid grid-cols-2 gap-y-2 text-sm">
                        <span class="text-gray-500">Transporter:</span>
                        <span class="font-bold text-gray-800 dark:text-gray-200 text-right">${transporter}</span>
                        
                        <span class="text-gray-500">Vehicle No:</span>
                        <span class="font-bold font-mono text-gray-800 dark:text-gray-200 text-right uppercase">${vehicle}</span>
                        
                        <span class="text-gray-500">LR No:</span>
                        <span class="font-bold font-mono text-gray-800 dark:text-gray-200 text-right">${lrNo}</span>
                        
                        <span class="text-gray-500">E-Way Bill:</span>
                        <span class="font-bold font-mono text-gray-800 dark:text-gray-200 text-right">${eway}</span>
                    </div>
                </div>
            </div>

            <div class="mt-4 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                <table class="w-full text-left bg-white dark:bg-[#1a1a1e]">
                    <thead class="bg-gray-50 dark:bg-[#222226] border-b border-gray-200 dark:border-gray-800">
                        <tr>
                            <th class="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-gray-500">#</th>
                            <th class="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-gray-500 w-1/3">Item Description</th>
                            <th class="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-gray-500">HSN/SAC</th>
                            <th class="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-gray-500 text-right">Qty</th>
                            <th class="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-gray-500">Unit</th>
                            <th class="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-gray-500 text-right">Rate</th>
                            <th class="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-gray-500 text-right">Total Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>
            </div>

            <div class="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-t border-gray-200 dark:border-gray-800 pt-6 mt-2">
                <div class="w-full md:w-1/2">
                    <p class="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">Remarks & Notes</p>
                    <p class="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-[#222226] p-3 rounded-lg border border-gray-200 dark:border-gray-800 min-h-[60px] italic">
                        ${remarks}
                    </p>
                </div>
                
                <div class="bg-primary dark:bg-blue-900/20 text-white dark:text-blue-100 p-5 rounded-2xl w-full md:w-64 border border-primary dark:border-blue-800/50 shadow-lg print:border-gray-400 print:text-black print:bg-white print:shadow-none">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-xs uppercase tracking-wider font-bold opacity-80">Total Items</span>
                        <span class="font-mono text-lg font-bold">${totalQty}</span>
                    </div>
                </div>
            </div>

            <div class="flex justify-between pt-24 pb-8 w-full px-8">
                <div class="text-center">
                    <div class="w-40 border-t-2 border-gray-800 dark:border-gray-500 mx-auto"></div>
                    <p class="text-xs font-bold text-gray-600 dark:text-gray-400 mt-2 uppercase tracking-widest">Receiver's Signature</p>
                </div>
                <div class="text-center">
                    <div class="w-40 border-t-2 border-gray-800 dark:border-gray-500 mx-auto"></div>
                    <p class="text-xs font-bold text-gray-600 dark:text-gray-400 mt-2 uppercase tracking-widest">Authorized Signatory</p>
                </div>
            </div>

        </div>
    `;

    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
}

function closeViewModal() {
    const modal = document.getElementById('view-modal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
}