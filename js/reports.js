// js/reports.js
import { loadSidebar } from './layout.js';

const API_BASE = 'http://localhost:5000/api';

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
    
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = today.toISOString().split('T')[0];
    
    document.getElementById('report-start-date').value = firstDay;
    document.getElementById('report-end-date').value = lastDay;

    const urlParams = new URLSearchParams(window.location.search);
    const reportParam = urlParams.get('reportType'); 
    const dropdownSelect = document.getElementById('report-config-select');

    if (reportParam && dropdownSelect) {
        const validOptions = ['sales', 'purchase', 'aging', 'ledger', 'logistics', 'tax'];
        if (validOptions.includes(reportParam)) {
            dropdownSelect.value = reportParam;
        }
    }

    document.getElementById('compile-btn').addEventListener('click', compileDossierData);
    document.getElementById('export-csv-btn').addEventListener('click', exportDynamicTableToCSV);

    // NEW: Real-time search filter for the unified header navbar!
    const searchInput = document.getElementById('headerSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', filterCurrentTable);
    }

    compileDossierData();
});

async function compileDossierData() {
    const config = document.getElementById('report-config-select').value;
    const startStr = document.getElementById('report-start-date').value;
    const endStr = document.getElementById('report-end-date').value;
    // DELETED: const entityFilter = document.getElementById('report-entity-filter').value...

    const btnText = document.getElementById('compile-btn-text');
    const tableHead = document.getElementById('ledger-table-head');
    const tableBody = document.getElementById('ledger-table-body');
    
    btnText.innerText = "Compiling...";
    tableBody.innerHTML = `<tr><td colspan="10" class="px-6 py-12 text-center text-gray-500 dark:text-gray-400 font-medium"><span class="material-symbols-outlined text-xl animate-spin inline-block align-middle mr-2">sync</span> Fetching Global Ledger...</td></tr>`;

    try {
        const response = await fetch(`${API_BASE}/challans`, { headers: getAuthHeaders() });
        if (!response.ok) throw new Error("Failed to authenticate or fetch ledger records.");
        const allData = await response.json();

        const startDate = new Date(startStr);
        const endDate = new Date(endStr);
        endDate.setHours(23, 59, 59); 

        // UPDATED: Simplified filter that only checks dates now
        let filteredData = allData.filter(item => {
            const itemDate = new Date(item.date || item.issue_date);
            return itemDate >= startDate && itemDate <= endDate;
        });

        tableHead.innerHTML = "";
        tableBody.innerHTML = "";

        switch (config) {
            case 'aging': renderAgingReport(filteredData, tableHead, tableBody); break;
            case 'ledger': renderPartyLedger(filteredData, tableHead, tableBody); break;
            case 'logistics': renderLogisticsTracker(filteredData, tableHead, tableBody); break;
            case 'tax': renderTaxHSNSummary(filteredData, tableHead, tableBody); break;
            case 'sales': 
            case 'purchase': 
                renderBasicSummary(filteredData, config, tableHead, tableBody); 
                break;
        }

        const selectEl = document.getElementById('report-config-select');
        document.getElementById('active-ledger-title').innerText = selectEl.options[selectEl.selectedIndex].text;
        document.getElementById('active-ledger-period').innerText = `Period: ${startStr} to ${endStr}`;
        document.getElementById('ledger-count-string').innerText = `Generated ${tableBody.children.length} rows.`;

        // Clear the search bar when new data loads
        const searchInput = document.getElementById('headerSearchInput');
        if (searchInput) searchInput.value = '';

    } catch (error) {
        console.error("Audit Engine Error:", error);
        tableBody.innerHTML = `<tr><td colspan="10" class="px-6 py-12 text-center text-red-500 dark:text-red-400 font-bold">Failed to execute compilation pipeline.</td></tr>`;
    } finally {
        btnText.innerText = "Generate Report";
    }
}

// --- DYNAMIC SEARCH FILTER FUNCTION ---
function filterCurrentTable() {
    const term = document.getElementById('headerSearchInput').value.toLowerCase();
    const tableBody = document.getElementById('ledger-table-body');
    const rows = tableBody.getElementsByTagName('tr');

    let visibleCount = 0;
    for (let i = 0; i < rows.length; i++) {
        // Skip the "No data" or "Loading" rows
        if (rows[i].children.length === 1 && rows[i].innerText.includes("Configure")) continue;

        const rowText = rows[i].innerText.toLowerCase();
        if (rowText.includes(term)) {
            rows[i].style.display = "";
            visibleCount++;
        } else {
            rows[i].style.display = "none";
        }
    }
    
    // Update count string
    const stringEl = document.getElementById('ledger-count-string');
    if (stringEl) {
        stringEl.innerText = term === '' 
            ? `Generated ${rows.length} rows.` 
            : `Showing ${visibleCount} matches.`;
    }
}

// ------------------------------------------------------------------
// REPORT 1: ACCOUNTS RECEIVABLE (AGING)
// ------------------------------------------------------------------
function renderAgingReport(data, head, body) {
    head.innerHTML = `
        <tr>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Challan ID</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Entity Name</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Issue Date</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Payment Terms</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Due Date</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Overdue Days</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Pending Amount</th>
        </tr>
    `;

    const pendingSales = data.filter(d => d.type === 'Out' && d.status !== 'Paid');
    const today = new Date();

    pendingSales.forEach(item => {
        const termsStr = item.payment_terms || "Immediate";
        const termDays = parseInt(termsStr.replace(/[^0-9]/g, '')) || 0;
        
        const issueDate = new Date(item.date || item.issue_date);
        const dueDate = new Date(issueDate);
        dueDate.setDate(issueDate.getDate() + termDays);

        const diffTime = today - dueDate;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const isOverdue = diffDays > 0;

        const rowClass = isOverdue ? "bg-red-50/50 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" : "hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors";
        const overduePill = isOverdue 
            ? `<span class="px-2.5 py-1 text-[11px] font-bold rounded-md bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-400 border border-red-200 dark:border-red-900/50">${diffDays} Days Late</span>` 
            : `<span class="px-2.5 py-1 text-[11px] font-bold rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">On Time</span>`;

        body.innerHTML += `
            <tr class="border-b border-gray-100 dark:border-gray-800/50 text-gray-900 dark:text-gray-300 ${rowClass}">
                <td class="px-6 py-4 font-mono font-bold">#${item.challan_number || item.id}</td>
                <td class="px-6 py-4 font-bold text-primary dark:text-blue-400">${item.party_name}</td>
                <td class="px-6 py-4">${issueDate.toLocaleDateString('en-IN')}</td>
                <td class="px-6 py-4">${termsStr}</td>
                <td class="px-6 py-4 font-semibold ${isOverdue ? 'text-red-600 dark:text-red-400' : ''}">${dueDate.toLocaleDateString('en-IN')}</td>
                <td class="px-6 py-4 text-right">${overduePill}</td>
                <td class="px-6 py-4 text-right font-mono font-bold">₹${parseFloat(item.total_amount || 0).toLocaleString('en-IN')}</td>
            </tr>
        `;
    });
}

// ------------------------------------------------------------------
// REPORT 2: PARTY-WISE LEDGER (RUNNING BALANCE)
// ------------------------------------------------------------------
function renderPartyLedger(data, head, body) {
    head.innerHTML = `
        <tr>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Challan ID</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Operation</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Entity</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right text-emerald-600 dark:text-emerald-400">Debit (Sales)</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right text-amber-600 dark:text-amber-400">Credit (Payments/In)</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right text-blue-600 dark:text-blue-400">Running Balance</th>
        </tr>
    `;

    const sortedData = data.sort((a, b) => new Date(a.date || a.issue_date) - new Date(b.date || b.issue_date));
    let runningBalance = 0;

    sortedData.forEach(item => {
        const amt = parseFloat(item.total_amount || 0);
        let debit = 0;
        let credit = 0;

        // Accounting Logic: Sales increase what they owe you (Debit). Returns/Payments In lower it (Credit).
        if (item.type === 'Out' || item.type === 'Payment Out') { 
            debit = amt; 
            runningBalance += amt; 
        } else if (item.type === 'In' || item.type === 'Sales Return' || item.type === 'Payment In') { 
            credit = amt; 
            runningBalance -= amt; 
        }

        body.innerHTML += `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/40 border-b border-gray-100 dark:border-gray-800/50 transition-colors text-gray-900 dark:text-gray-300">
                <td class="px-6 py-4 whitespace-nowrap">${new Date(item.date || item.issue_date).toLocaleDateString('en-IN')}</td>
                <td class="px-6 py-4 font-mono font-bold text-[13px]">#${item.challan_number || item.id}</td>
                <td class="px-6 py-4">${item.type}</td>
                <td class="px-6 py-4 font-semibold text-[13px] truncate max-w-[200px]">${item.party_name}</td>
                <td class="px-6 py-4 text-right font-mono text-emerald-700 dark:text-emerald-400">${debit > 0 ? '₹' + debit.toLocaleString('en-IN') : '-'}</td>
                <td class="px-6 py-4 text-right font-mono text-amber-700 dark:text-amber-400">${credit > 0 ? '₹' + credit.toLocaleString('en-IN') : '-'}</td>
                <td class="px-6 py-4 text-right font-mono font-bold text-blue-700 dark:text-blue-400">₹${runningBalance.toLocaleString('en-IN')}</td>
            </tr>
        `;
    });
}

// ------------------------------------------------------------------
// REPORT 3: LOGISTICS & DISPATCH TRACKER
// ------------------------------------------------------------------
function renderLogisticsTracker(data, head, body) {
    head.innerHTML = `
        <tr>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Challan ID</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dispatch Date</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Destination Entity</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Transporter</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Vehicle No.</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">LR / E-Way Bill</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Transit Status</th>
        </tr>
    `;

    const dispatchData = data.filter(d => d.type === 'Out'); 

    dispatchData.forEach(item => {
        const status = item.status || 'Processing';
        let statusPill = `<span class="px-2.5 py-1 text-[11px] font-bold uppercase rounded-md bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700">${status}</span>`;
        if (status === 'Dispatched') statusPill = `<span class="px-2.5 py-1 text-[11px] font-bold uppercase rounded-md bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50">In Transit</span>`;
        if (status === 'Delivered') statusPill = `<span class="px-2.5 py-1 text-[11px] font-bold uppercase rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">Delivered</span>`;

        body.innerHTML += `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/40 border-b border-gray-100 dark:border-gray-800/50 transition-colors text-gray-900 dark:text-gray-300">
                <td class="px-6 py-4 font-mono font-bold">#${item.challan_number || item.id}</td>
                <td class="px-6 py-4">${new Date(item.date || item.issue_date).toLocaleDateString('en-IN')}</td>
                <td class="px-6 py-4 font-semibold text-[13px] truncate max-w-[150px]">${item.party_name}</td>
                <td class="px-6 py-4">${item.transporter || 'Self'}</td>
                <td class="px-6 py-4 font-mono uppercase">${item.vehicle_number || '-'}</td>
                <td class="px-6 py-4 font-mono text-[12px] opacity-80 flex flex-col gap-1">
                    <span>LR: ${item.lr_number || '-'}</span>
                    <span>EWB: ${item.eway_bill || '-'}</span>
                </td>
                <td class="px-6 py-4 text-right">${statusPill}</td>
            </tr>
        `;
    });
}

// ------------------------------------------------------------------
// REPORT 4: TAX / GST COMPLIANCE (HSN SUMMARY)
// ------------------------------------------------------------------
function renderTaxHSNSummary(data, head, body) {
    head.innerHTML = `
        <tr>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">HSN / SAC Code</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Quantity Dispatched</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Total Taxable Value (INR)</th>
        </tr>
    `;

    const hsnMap = {};
    data.filter(d => d.type === 'Out').forEach(challan => {
        (challan.items || []).forEach(item => {
            const hsn = item.hsn_code || 'UNCLASSIFIED';
            if (!hsnMap[hsn]) hsnMap[hsn] = { qty: 0, value: 0 };
            
            hsnMap[hsn].qty += parseInt(item.quantity || 0);
            hsnMap[hsn].value += (parseInt(item.quantity || 0) * parseFloat(item.unit_price || 0));
        });
    });

    Object.keys(hsnMap).sort().forEach(hsn => {
        body.innerHTML += `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/40 border-b border-gray-100 dark:border-gray-800/50 transition-colors text-gray-900 dark:text-gray-300">
                <td class="px-6 py-4 font-mono font-bold text-primary dark:text-blue-400 text-lg tracking-widest">${hsn}</td>
                <td class="px-6 py-4 font-mono">${hsnMap[hsn].qty.toLocaleString('en-IN')} Units</td>
                <td class="px-6 py-4 text-right font-mono font-bold">₹${hsnMap[hsn].value.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
            </tr>
        `;
    });
}

// ------------------------------------------------------------------
// REPORT 5: BASIC SALES / PURCHASE SUMMARY
// ------------------------------------------------------------------
function renderBasicSummary(data, typeFilter, head, body) {
    head.innerHTML = `
        <tr>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Challan ID</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Entity</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
            <th class="px-6 py-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Gross Value</th>
        </tr>
    `;

    const mappedType = typeFilter === 'sales' ? 'Out' : 'In';
    const subset = data.filter(d => d.type === mappedType);

    subset.forEach(item => {
        body.innerHTML += `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/40 border-b border-gray-100 dark:border-gray-800/50 transition-colors text-gray-900 dark:text-gray-300">
                <td class="px-6 py-4 font-mono font-bold">#${item.challan_number || item.id}</td>
                <td class="px-6 py-4">${new Date(item.date || item.issue_date).toLocaleDateString('en-IN')}</td>
                <td class="px-6 py-4 font-semibold">${item.party_name}</td>
                <td class="px-6 py-4">${item.status || 'Processing'}</td>
                <td class="px-6 py-4 text-right font-mono font-bold">₹${parseFloat(item.total_amount || 0).toLocaleString('en-IN')}</td>
            </tr>
        `;
    });
}

// ------------------------------------------------------------------
// ULTIMATE DYNAMIC CSV EXPORTER
// ------------------------------------------------------------------
function exportDynamicTableToCSV() {
    const tableHead = document.getElementById('ledger-table-head');
    const tableBody = document.getElementById('ledger-table-body');

    // Make sure we only export visible rows (so the global search filter works!)
    const visibleRows = Array.from(tableBody.querySelectorAll('tr')).filter(row => row.style.display !== 'none');

    if (visibleRows.length === 0 || visibleRows[0].innerText.includes("Configure parameters") || visibleRows[0].innerText.includes("Fetching")) {
        alert("No valid data to export.");
        return;
    }

    let csvContent = "";

    const headers = Array.from(tableHead.querySelectorAll('th')).map(th => `"${th.innerText.trim()}"`);
    csvContent += headers.join(",") + "\n";

    visibleRows.forEach(row => {
        const rowData = Array.from(row.querySelectorAll('td')).map(td => {
            let text = td.innerText.trim().replace(/\n/g, ' - ').replace(/₹/g, '').replace(/,/g, ''); 
            return `"${text}"`;
        });
        csvContent += rowData.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const reportType = document.getElementById('report-config-select').options[document.getElementById('report-config-select').selectedIndex].text.replace(/ /g, '_');
    
    link.setAttribute("href", url);
    link.setAttribute("download", `Technocraft_${reportType}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}