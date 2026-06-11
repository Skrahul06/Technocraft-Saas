// js/challan.js
import { loadSidebar } from './layout.js';

const API_BASE = 'http://localhost:5000/api';
let allChallans = []; // Global store for search and export

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    loadSidebar();
    fetchData();
    setupEventListeners();
});

// --- 1. DATA FETCHING ---
async function fetchData() {
    const tbody = document.getElementById('challans-body');
    try {
        // FIXED: Querying our complete database list endpoint instead of limited dashboard snapshots
        const response = await fetch(`${API_BASE}/challans`);
        if (!response.ok) throw new Error(`Server returned status code ${response.status}`);
        
        allChallans = await response.json(); 
        renderTable(allChallans);
    } catch (error) {
        console.error("Error fetching data:", error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-red-500 font-semibold">Failed to connect to backend server. ${error.message}</td></tr>`;
        }
    }
}

// --- 2. RENDER TABLE ---
function renderTable(data) {
    const tbody = document.getElementById('challans-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-gray-500">No records found.</td></tr>`;
        return;
    }

    data.forEach(c => {
        const id = c.challan_number || c.id || 'N/A';
        const date = new Date(c.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
        const party = c.party_name || c.client || 'Unknown Entity';
        const amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(c.total_amount || c.amount || 0);
        const type = c.type || 'Standard';
        const status = c.status || 'Pending';

        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50/80 transition-colors group border-b border-gray-100 text-on-surface text-sm";
        
        // FIX: Added matching w-[%] column tags inline to snap your text rows into tight alignment alongside your headers!
        tr.innerHTML = `
            <td class="py-4 px-6 text-left font-mono font-bold w-[15%] truncate">#${id}</td>
            <td class="py-4 px-4 text-left text-gray-500 whitespace-nowrap w-[15%]">${date}</td>
            <td class="py-4 px-6 text-left min-w-0 w-[30%]">
                <div class="flex flex-col">
                    <span class="font-bold text-gray-800 truncate max-w-[220px]" title="${party}">${party}</span>
                    <span class="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wider font-extrabold truncate">${type}</span>
                </div>
            </td>
            <td class="py-4 px-6 text-right font-mono font-bold text-gray-900 w-[15%]">${amount}</td>
            <td class="py-4 px-4 text-center whitespace-nowrap w-[12%]">${getStatusBadge(status)}</td>
            <td class="py-4 px-6 text-center print-hidden w-[13%]">
                <div class="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button data-action="view" data-id="${id}" class="p-1.5 rounded-md hover:bg-primary/10 hover:text-primary text-gray-400 transition-colors cursor-pointer" title="View Document">
                        <span class="material-symbols-outlined text-[18px]">visibility</span>
                    </button>
                    <button data-action="edit" data-id="${id}" class="p-1.5 rounded-md hover:bg-amber-50 hover:text-amber-600 text-gray-400 transition-colors cursor-pointer" title="Edit Record">
                        <span class="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button data-action="print" data-id="${id}" class="p-1.5 rounded-md hover:bg-emerald-50 hover:text-emerald-600 text-gray-400 transition-colors cursor-pointer" title="Print Challan">
                        <span class="material-symbols-outlined text-[18px]">print</span>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    attachActionListeners();
}

// Helper utility rendering custom state colors badge parameters
function getStatusBadge(status) {
    const s = status.toLowerCase();
    const base = "px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase inline-block";
    if (s.includes('paid')) return `<span class="${base} bg-emerald-100 text-emerald-800">Paid</span>`;
    if (s.includes('pending')) return `<span class="${base} bg-amber-100 text-amber-800">Pending</span>`;
    return `<span class="${base} bg-gray-100 text-gray-700">${status}</span>`;
}

// --- 3. EVENT LISTENERS ---
function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allChallans.filter(c => {
                const id = (c.challan_number || c.id || '').toLowerCase();
                const party = (c.party_name || c.client || '').toLowerCase();
                return id.includes(term) || party.includes(term);
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
                    refreshBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">sync</span> Refresh Data`;
                }, 500);
            });
        });
    }

    const exportCsvBtn = document.getElementById('export-csv-btn');
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => {
            if (!allChallans || allChallans.length === 0) return alert("No data to export.");
            
            let csv = "Challan ID,Date,Party/Entity,Type,Amount (INR),Status\n";
            allChallans.forEach(c => {
                const id = c.challan_number || c.id;
                const date = new Date(c.date).toLocaleDateString('en-IN');
                const party = c.party_name || c.client;
                const amount = c.total_amount || c.amount;
                csv += `"${id}","${date}","${party}","${c.type}","${amount}","${c.status}"\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `Technocraft_Export_${new Date().toISOString().split('T')[0]}.csv`;
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

// --- 4. BILLING FORMAT (VIEW/PRINT) ---
function openViewModal(id) {
    const record = allChallans.find(c => (c.challan_number === id || c.id === id));
    if (!record) return;

    const modal = document.getElementById('view-modal');
    const printArea = document.getElementById('print-area');
    if (!modal || !printArea) return;

    const date = new Date(record.date).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' });
    const amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(record.total_amount || record.amount || 0);
    const party = record.party_name || record.client || 'Unknown Entity';
    const type = record.type || 'Standard';
    const status = record.status || 'Pending';

    printArea.innerHTML = `
        <div class="flex flex-col gap-6 w-full text-slate-800">
            
            <div class="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b border-gray-200 w-full">
                <div class="flex flex-col">
                    <h1 class="text-xl md:text-2xl font-black tracking-tight uppercase flex flex-wrap gap-x-2 leading-none">
                        <span class="text-slate-800">Technocraft</span>
                        <span class="text-primary">Challan</span>
                    </h1>
                    <p class="text-xs font-bold text-primary mt-1 tracking-wide">Operations & Logistics Management</p>
                    <p class="text-[11px] md:text-xs text-gray-400 leading-relaxed mt-1">
                        123 Tech Park, Suite 400<br/>Kolkata, WB 700001
                    </p>
                </div>
                
                <div class="flex flex-col items-start sm:items-end gap-1.5 shrink-0 max-w-full">
                    <span class="font-mono text-xs text-slate-700 font-bold break-all bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                        #${id}
                    </span>
                    <div class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${status.toLowerCase() === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                        Status: ${status}
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                <div class="bg-slate-50 p-4 rounded-xl border border-gray-200/80 flex flex-col gap-1">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Billed To Entity</span>
                    <h3 class="text-base font-extrabold text-slate-800 truncate" title="${party}">${party}</h3>
                    <p class="text-xs text-gray-500 font-medium">Operation Type: <strong class="text-primary">${type}</strong></p>
                </div>
                <div class="bg-slate-50 p-4 rounded-xl border border-gray-200/80 flex flex-col gap-1 text-left sm:text-right">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Issue Date</span>
                    <h3 class="text-base font-extrabold text-slate-800">${date}</h3>
                    <p class="text-xs text-gray-500 font-medium">Authorized Transaction Logs</p>
                </div>
            </div>

            <div class="mt-2 w-full overflow-hidden">
                <div class="overflow-x-auto w-full rounded-xl border border-gray-100">
                    <table class="w-full text-left min-w-[460px] border-collapse bg-white">
                        <thead>
                            <tr class="bg-slate-50 border-b border-gray-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                <th class="py-3 px-4 w-[55%]">Description Parameters</th>
                                <th class="py-3 px-4 w-[20%] text-center">Category</th>
                                <th class="py-3 px-4 w-[25%] text-right">Line Total</th>
                            </tr>
                        </thead>
                        <tbody class="text-xs text-slate-700 divide-y divide-gray-100">
                            <tr class="hover:bg-slate-50/50 transition-colors">
                                <td class="py-4 px-4 font-semibold leading-relaxed text-sm text-slate-800">
                                    Consolidated Logistics & Goods Asset Transfer Feed Logs
                                </td>
                                <td class="py-4 px-4 text-center font-mono font-medium text-slate-500">${type}</td>
                                <td class="py-4 px-4 text-right font-mono font-bold text-sm text-slate-900">${amount}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="flex justify-end w-full mt-2">
                <div class="w-full sm:w-64 flex flex-col gap-2 bg-slate-50 p-4 rounded-xl border border-gray-200/60 text-xs font-semibold">
                    <div class="flex justify-between text-gray-500">
                        <span>Subtotal Base</span>
                        <span class="font-mono font-medium">${amount}</span>
                    </div>
                    <div class="flex justify-between text-gray-500">
                        <span>Tax Assessment (0%)</span>
                        <span class="font-mono font-medium">₹0.00</span>
                    </div>
                    <div class="h-px bg-gray-200 my-1"></div>
                    <div class="flex justify-between text-sm font-extrabold text-slate-900">
                        <span>Net Valuation</span>
                        <span class="font-mono text-primary">${amount}</span>
                    </div>
                </div>
            </div>

            <div class="border-t border-gray-200/80 pt-4 mt-6 flex flex-col sm:flex-row justify-between items-start gap-4 text-gray-400">
                <div class="w-full sm:w-2/3">
                    <p class="font-bold text-gray-500 mb-0.5 text-xs">Terms & Conditions</p>
                    <p class="text-[11px] leading-relaxed">Payment is due upon immediate receipt context. Please reference matching digital Challan ID tokens on all incoming ledger communications pipelines.</p>
                </div>
                <div class="w-full sm:w-1/3 text-left sm:text-right text-[9px] uppercase tracking-widest font-bold text-gray-400/80 leading-normal sm:pt-1">
                    Generated securely via<br/>Technocraft Central System
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