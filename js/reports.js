// js/reports.js
import { loadSidebar } from './layout.js';

const API_BASE = 'http://localhost:5000/api';
let currentlyCompiledData = []; // Global variable to store active dataset for CSV export

document.addEventListener('DOMContentLoaded', () => {
    loadSidebar();
    
    // Set default date range: From 1st of current month to today
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = today.toISOString().split('T')[0];
    
    document.getElementById('report-start-date').value = firstDay;
    document.getElementById('report-end-date').value = lastDay;

    // Intercept URL query parameters from incoming dashboard card clicks
    const urlParams = new URLSearchParams(window.location.search);
    const reportParam = urlParams.get('reportType'); // Catches 'sales', 'purchase', etc.
    const dropdownSelect = document.getElementById('report-config-select');

    if (reportParam && dropdownSelect) {
        // Map the incoming URL strings to your explicit select option value names
        const validOptions = ['sales', 'purchase', 'sales_return', 'purchase_return', 'dues'];
        
        if (validOptions.includes(reportParam)) {
            dropdownSelect.value = reportParam;
        }
    }

    // Trigger Initial Run using the parsed dropdown state
    compileDossierData();

    // Event Handler Button Bindings
    document.getElementById('compile-btn').addEventListener('click', compileDossierData);
    document.getElementById('export-csv-btn').addEventListener('click', exportToCSV);
});

async function compileDossierData() {
    const config = document.getElementById('report-config-select').value;
    const startStr = document.getElementById('report-start-date').value;
    const endStr = document.getElementById('report-end-date').value;

    const btnText = document.getElementById('compile-btn-text');
    const tableBody = document.getElementById('ledger-table-body');
    
    // UI Feedback update state
    btnText.innerText = "Compiling...";
    tableBody.innerHTML = `
        <tr>
            <td colspan="5" class="px-8 py-12 text-center text-on-surface-variant font-medium">
                <span class="material-symbols-outlined text-xl animate-spin inline-block align-middle mr-2">sync</span>
                Parsing Transaction Logs & Ledger Records...
            </td>
        </tr>
    `;

    try {
        // HIT THE NEW DEDICATED REPORTS ROUTE (Dates are now passed directly to SQL)
        const fetchUrl = `${API_BASE}/reports/ledger?startDate=${startStr}&endDate=${endStr}`;
        const response = await fetch(fetchUrl);
        const data = await response.json();
        
        // Target the new payload array name returned by your backend
        const transactions = data.ledgerRecords || [];

        // FILTER ONLY BY CONFIG TYPE (SQL handled the dates)
        let filtered = transactions.filter(t => {
            if (config === 'sales' && t.type !== 'Out') return false;
            if (config === 'purchase' && t.type !== 'In') return false;
            if (config === 'sales_return' && t.type !== 'Sales Return') return false;
            if (config === 'purchase_return' && t.type !== 'Purchase Return') return false;
            if (config === 'dues' && t.status !== 'Pending') return false;
            return true;
        });

        // Store this globally so the CSV downloader can access the filtered dataset
        currentlyCompiledData = filtered;

        // Clear display and insert dynamic values
        tableBody.innerHTML = "";
        
        if (filtered.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-8 py-12 text-center text-outline font-medium">No archived records match the designated parameters boundaries.</td>
                </tr>
            `;
            document.getElementById('ledger-count-string').innerText = `Showing 0 matched ledger units`;
            return;
        }

        filtered.forEach((item, index) => {
            const statusClass = item.status === 'Paid' 
                ? 'bg-emerald-100 text-emerald-800' 
                : 'bg-amber-100 text-amber-800';

            const segment = item.type === 'Out' ? 'Global Distribution' : 'Regional Procurement';
            
            let cleanTimestamp = item.date;
            if (cleanTimestamp && cleanTimestamp.includes('T')) {
                cleanTimestamp = cleanTimestamp.replace('T', ' ').substring(0, 16);
            }

            const row = document.createElement('tr');
            row.className = "hover:bg-surface-container-lowest transition-colors group";
            
            // Formatted output value cleanly to Indian Rupees (Lakhs/Crores standard formatting)
            const formattedRupees = parseFloat(item.total_amount).toLocaleString('en-IN', {
                style: 'currency',
                currency: 'INR',
                minimumFractionDigits: 2
            });

            row.innerHTML = `
                <td class="px-8 py-5 font-mono text-sm text-on-surface">LDR-2026-${String(index + 1).padStart(4, '0')}</td>
                <td class="px-8 py-5 font-mono text-sm text-on-surface-variant">${cleanTimestamp}</td>
                <td class="px-8 py-5 font-body-md text-sm text-on-surface">${item.party_name || segment}</td>
                <td class="px-8 py-5 font-mono text-sm text-on-surface text-right font-bold">${formattedRupees}</td>
                <td class="px-8 py-5 text-center">
                    <span class="inline-flex items-center px-3 py-1 rounded-full ${statusClass} text-[11px] font-bold uppercase tracking-wider">${item.status === 'Paid' ? 'Finalized' : 'Pending'}</span>
                </td>
            `;
            tableBody.appendChild(row);
        });

        // UI Header adjustments
        const selectEl = document.getElementById('report-config-select');
        document.getElementById('active-ledger-title').innerText = `Audit Ledger: ${selectEl.options[selectEl.selectedIndex].text}`;
        document.getElementById('active-ledger-period').innerText = `Period Range: ${startStr || 'All Time'} — ${endStr || 'Present'}`;
        document.getElementById('ledger-count-string').innerText = `Showing ${filtered.length} compiled active operational log units.`;

    } catch (error) {
        console.error("Audit Engine Error:", error);
        tableBody.innerHTML = `<tr><td colspan="5" class="px-8 py-12 text-center text-error font-bold">Failed to run compilation script process pipeline.</td></tr>`;
    } finally {
        btnText.innerText = "Compile Dossier";
    }
}

// 2. DYNAMIC CSV EXPORT GENERATOR
function exportToCSV() {
    if (currentlyCompiledData.length === 0) {
        alert("There is no compiled data to export. Please run a dossier compilation first.");
        return;
    }

    // Define CSV Headers
    let csvContent = "Ledger ID,Compilation Date,Operation Segment,Gross Volume Asset Value (INR),Verification Status\n";

    // Build rows out of the currently compiled array loop
    currentlyCompiledData.forEach((item, index) => {
        const id = `LDR-2026-${String(index + 1).padStart(4, '0')}`;
        const date = item.date;
        const segment = item.party_name || (item.type === 'Out' ? 'Global Distribution' : 'Regional Procurement');
        const value = parseFloat(item.total_amount).toFixed(2);
        const status = item.status === 'Paid' ? 'FINALIZED' : 'PENDING REVIEW';

        // Escape comma values inside entity names to prevent column breakage
        csvContent += `"${id}","${date}","${segment.replace(/"/g, '""')}","${value}","${status}"\n`;
    });

    // Create a data blob link and click it programmatically to execute background file generation
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    // Grab the HTML Select Element directly, then extract its string code separately
    const selectConfigElement = document.getElementById('report-config-select');
    const activeValueString = selectConfigElement ? selectConfigElement.value : 'Report';
    
    link.setAttribute("href", url);
    link.setAttribute("download", `Technocraft_Audit_${activeValueString}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}