// js/audit.js
const API_BASE = 'http://localhost:5000/api';

async function loadAuditLogs(page = 1) {
    const logsBody = document.getElementById('logs-body');
    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`${API_BASE}/admin/logs?page=${page}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const logs = await response.json();
        
        // This is the core logic that parses the JSON we saved in logger.js
        logsBody.innerHTML = logs.map(log => formatLogEntry(log)).join('');
    } catch (err) {
        logsBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-500">Error loading logs.</td></tr>`;
    }
}

function formatLogEntry(log) {
    let details = {};
    try {
        // Your database already has the JSON here
        details = typeof log.details === 'string' ? JSON.parse(log.details) : (log.details || {});
    } catch (e) { console.error("Parse error:", e); }

    let actionDesc = "";
    
    // Check if table_name is 'challans'
    if (log.table_name === 'challans') {
        const id = details.challan_number || 'N/A';
        const party = details.party_name || 'a party';
        actionDesc = `Created Challan <strong>#${id}</strong> for <strong>${party}</strong>`;
    } else {
        actionDesc = `Performed ${log.action} action on ${log.table_name}`;
    }

    return `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b dark:border-gray-700">
            <td class="py-4 font-semibold">${log.username || 'System'}</td>
            <td class="py-4 text-gray-600 dark:text-gray-300">${actionDesc}</td>
            <td class="py-4">
                <span class="text-[10px] font-mono bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded uppercase">${log.table_name}</span>
            </td>
            <td class="py-4 text-gray-400 text-sm">${new Date(log.created_at).toLocaleString()}</td>
        </tr>
    `;
}

document.addEventListener('DOMContentLoaded', () => loadAuditLogs(1));