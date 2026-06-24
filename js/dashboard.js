// js/dashboard.js
const API_BASE = 'https://technocraft-saas.onrender.com/api';
//const API_BASE = 'http://localhost:5000/api';
import { loadSidebar, setupLogout } from './layout.js';

document.addEventListener('DOMContentLoaded', async () => {
    await loadSidebar();
    setupLogout(); // <--- This activates the logout button
});

let dashboardData = {};
let lineChartInstance = null;
let pieChartInstance = null;

// --- CHART DARK MODE HELPERS ---
const isDark = () => document.documentElement.classList.contains('dark');
const getGridColor = () => isDark() ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
const getTextColor = () => isDark() ? '#f3f4f6' : '#1b1b1d';
const getTickColor = () => isDark() ? '#9ca3af' : '#64748b';

// --- 1. ANIMATION & UI HELPERS ---
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const currentVal = Math.floor(progress * (end - start) + start);
        
        // Changed to format strictly as integer units (No currency)
        obj.innerHTML = new Intl.NumberFormat('en-IN').format(currentVal);
        
        if (progress < 1) window.requestAnimationFrame(step);
        else obj.innerHTML = new Intl.NumberFormat('en-IN').format(end);
    };
    window.requestAnimationFrame(step);
}

function updateTrendUI(elementId, percentage) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const val = parseFloat(percentage);
    const baseClasses = "text-label-md font-label-md mt-1 flex items-center gap-1 ";
    
    if (val > 0) {
        el.innerHTML = `<span class="material-symbols-outlined text-[14px]">arrow_upward</span> +${val}% from last period`;
        el.className = baseClasses + "text-[#059669] dark:text-emerald-400"; 
    } else if (val < 0) {
        el.innerHTML = `<span class="material-symbols-outlined text-[14px]">arrow_downward</span> ${val}% from last period`;
        el.className = baseClasses + "text-[#ba1a1a] dark:text-red-400"; 
    } else {
        el.innerHTML = `<span class="material-symbols-outlined text-[14px]">horizontal_rule</span> 0.0% from last period`;
        el.className = baseClasses + "text-on-surface-variant dark:text-gray-500"; 
    }
}

// --- 2. DATA FETCHING ---
async function initDashboard() {
    try {
        // 1. Retrieve the token saved during login
        const token = localStorage.getItem('token');
        
        // 2. If no token, redirect to login immediately
        if (!token) {
            window.location.href = 'login.html';
            return;
        }

        const response = await fetch(`${API_BASE}/dashboard/stats`, {
            method: 'GET',
            headers: {
                // 3. Attach the Bearer token to the Authorization header
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        // 4. Handle Unauthorized access
        if (response.status === 401) {
            localStorage.removeItem('token'); // Clear expired/bad token
            window.location.href = 'login.html';
            return;
        }

        if (!response.ok) throw new Error('Failed to fetch data');
        dashboardData = await response.json();

        // Animate KPIs
        animateValue(document.getElementById('kpi-sales'), 0, dashboardData.kpis.sales, 1500);
        animateValue(document.getElementById('kpi-purchases'), 0, dashboardData.kpis.purchases, 1500);
        animateValue(document.getElementById('kpi-sales-return'), 0, dashboardData.kpis.salesReturn, 1500);
        animateValue(document.getElementById('kpi-purchase-return'), 0, dashboardData.kpis.purchaseReturn, 1500);

        // Update Trends
        updateTrendUI('trend-sales', dashboardData.kpis.salesTrend);
        updateTrendUI('trend-purchases', dashboardData.kpis.purchaseTrend);
        updateTrendUI('trend-sales-return', dashboardData.kpis.salesReturnTrend);
        updateTrendUI('trend-purchase-return', dashboardData.kpis.purchaseReturnTrend);

        // Render Charts & Tables
        renderTopPartiesChart(dashboardData.topParties || []);
        renderLineChart(dashboardData.salesTrendWeekly || [], 'Last 7 Days Transfers');
        
        // Render Bottom Sections
        renderRecentTransactions(dashboardData.recentTransactions || []);
        renderLowStockAlerts(dashboardData.lowStockAlerts || []);

    } catch (error) {
        console.error("Dashboard Error:", error);
        
        // Keep your existing error UI logic here...
        const tbody = document.getElementById('recent-transactions-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-[#ba1a1a] dark:text-red-400 font-medium">Failed to load dashboard data.</td></tr>`;
        }
    }
}

// --- 3. RENDERING FUNCTIONS ---
function renderRecentTransactions(transactions) {
    const tbody = document.getElementById('recent-transactions-body');
    if (!tbody) return;

    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-on-surface-variant dark:text-gray-500 text-sm">No transactions found.</td></tr>`;
        return;
    }

    // VISUAL FIX: Applied dark mode text and hover classes
    const rowsHtml = transactions.slice(0, 5).map(t => {
        const challanId = t.challan_number || t.challan_id || t.id || 'N/A';
        const orderId = t.order_id || '-';
        const party = t.party_name || t.client || t.customer_entity || 'N/A';
        
        const dateObj = new Date(t.date || t.issue_date);
        const formattedDate = dateObj.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
        const quantity = new Intl.NumberFormat('en-IN').format(t.net_quantity || t.quantity || 0);

        return `
            <tr class="border-b border-surface-container-low dark:border-gray-800/50 hover:bg-surface-container-low dark:hover:bg-gray-800/40 transition-colors group">
                <td class="py-3 text-on-surface dark:text-gray-100 font-semibold text-sm">#${challanId}</td>
                <td class="py-3 text-on-surface-variant dark:text-gray-400 text-sm font-mono">${orderId}</td>
                <td class="py-3 text-on-surface-variant dark:text-gray-400 text-sm">${formattedDate}</td>
                <td class="py-3 text-on-surface dark:text-gray-300 text-sm font-medium truncate max-w-[150px]" title="${party}">${party}</td>
                <td class="py-3 text-right font-bold text-on-surface dark:text-gray-200 text-sm">${quantity} Units</td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = rowsHtml;
}

function renderLowStockAlerts(alerts) {
    const container = document.getElementById('low-stock-container');
    if (!container) return;
    container.innerHTML = '';

    if (!alerts || alerts.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-6 text-on-surface-variant dark:text-gray-500">
                <span class="material-symbols-outlined text-[40px] mb-2 text-surface-dim dark:text-gray-700">check_circle</span>
                <p class="text-sm font-medium">All stock levels are healthy.</p>
            </div>
        `;
        return;
    }

    // VISUAL FIX: Applied dark mode text and hover classes
    alerts.forEach(item => {
        container.innerHTML += `
            <div class="flex items-center gap-4 p-2 hover:bg-surface-container-low dark:hover:bg-gray-800/40 rounded-lg transition-colors group cursor-pointer">
                <div class="w-10 h-10 bg-error/10 dark:bg-red-500/10 text-error dark:text-red-400 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-error group-hover:text-white dark:group-hover:bg-red-500 transition-colors">
                    <span class="material-symbols-outlined text-[20px]">inventory_2</span>
                </div>
                <div class="flex-grow min-w-0">
                    <p class="font-bold text-on-surface dark:text-gray-200 text-sm truncate pr-2">${item.name}</p>
                    <p class="text-[11px] text-outline-variant dark:text-gray-500 truncate">SKU: ${item.sku}</p>
                </div>
                <div class="text-right flex-shrink-0">
                    <p class="font-bold text-[#ba1a1a] dark:text-red-400 text-sm">${item.current_stock} Units</p>
                    <button onclick="window.location.href='create-challan.html?sku=${item.sku}'" class="text-[11px] text-primary dark:text-blue-400 hover:text-primary-fixed-variant dark:hover:text-blue-300 hover:underline font-semibold mt-0.5 transition-colors">Reorder</button>
                </div>
            </div>
        `;
    });
}

// VISUAL FIX: Dynamic coloring for the pie chart text plugin
const centerTextPlugin = {
    id: 'centerText',
    beforeDraw: function(chart) {
        if (chart.config.type !== 'doughnut') return;
        const { width, height, ctx } = chart;
        ctx.restore();
        
        const total = chart.config.data.datasets[0].data.reduce((a, b) => a + b, 0);
        const compactTotal = new Intl.NumberFormat('en-IN', { notation: "compact", maximumFractionDigits: 1 }).format(total);
        
        ctx.font = "bold 24px 'Hanken Grotesk', sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillStyle = getTextColor(); // Now dynamic!
        const textX = Math.round((width - ctx.measureText(compactTotal).width) / 2);
        const textY = height / 2 - 8;
        ctx.fillText(compactTotal, textX, textY);
        
        ctx.font = "600 11px 'Hanken Grotesk', sans-serif";
        ctx.fillStyle = getTickColor(); // Now dynamic!
        const label = "TOTAL UNITS";
        const labelX = Math.round((width - ctx.measureText(label).width) / 2);
        const labelY = height / 2 + 14;
        ctx.fillText(label, labelX, labelY);
        ctx.save();
    }
};

// --- 4. CHARTS CONFIGURATION ---
function renderTopPartiesChart(partyData) {
    const ctx = document.getElementById('pieChart'); 
    if (!ctx) return;

    if (!partyData || partyData.length === 0) {
        partyData = [{ party_name: 'No Data Yet', total_units: 1 }];
    }

    const labels = partyData.map(p => p.party_name);
    const data = partyData.map(p => parseInt(p.total_units));
    const colors = ['#4c5b71', '#7b8c9d', '#a3b4c8', '#cbd5e1'];

    if (pieChartInstance) pieChartInstance.destroy();

    pieChartInstance = new Chart(ctx, {
        type: 'doughnut', 
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors, 
                borderWidth: 0 // Removes harsh borders in dark mode
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%', 
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: (context) => ` ${context.raw} Units` }
                }
            }
        },
        plugins: [typeof centerTextPlugin !== 'undefined' ? centerTextPlugin : {}] 
    });

    const legendContainer = document.getElementById('custom-pie-legend');
    if (legendContainer) {
        legendContainer.innerHTML = labels.map((label, index) => {
            const color = colors[index % colors.length];
            return `
                <div class="flex items-center gap-2 text-[13px] text-slate-500 dark:text-gray-400 font-bold truncate" title="${label}">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${color}"></span>
                    <span class="truncate">${label}</span>
                </div>
            `;
        }).join('');
    }
}

function renderLineChart(trendData, datasetLabel) {
    const canvas = document.getElementById('lineChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const dataSafe = trendData || [];
    const labels = dataSafe.length ? dataSafe.map(t => t.label) : ['-'];
    const data = dataSafe.length ? dataSafe.map(t => parseFloat(t.total)) : [0];

    let gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(76, 91, 113, 0.4)'); 
    gradient.addColorStop(1, 'rgba(76, 91, 113, 0.0)');

    if (lineChartInstance) lineChartInstance.destroy();

    lineChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: datasetLabel,
                data: data,
                borderColor: '#4c5b71',
                backgroundColor: gradient,
                borderWidth: 4,
                fill: true,
                tension: 0.4, 
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#4c5b71',
                pointBorderWidth: 3,
                pointRadius: 5,
                pointHoverRadius: 8,
                pointHoverBackgroundColor: '#4c5b71',
                pointHoverBorderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 2000, easing: 'easeOutQuart', y: { from: 500 } },
            plugins: {
                legend: { display: false },
                tooltip: { 
                    mode: 'index', intersect: false, backgroundColor: 'rgba(27, 27, 29, 0.95)', 
                    titleFont: { family: 'Hanken Grotesk', size: 14 },
                    callbacks: { 
                        label: (context) => ` ${new Intl.NumberFormat('en-IN').format(context.parsed.y)} Units` 
                    }
                }
            },
            scales: {
                // VISUAL FIX: Dynamic scale colors
                x: { 
                    grid: { display: false }, 
                    ticks: { font: { family: 'Hanken Grotesk', weight: 'bold' }, color: getTickColor() } 
                },
                y: { 
                    beginAtZero: true, border: { display: false }, 
                    grid: { color: getGridColor(), borderDash: [5, 5] },
                    ticks: { font: { family: 'Hanken Grotesk', weight: 'bold' }, color: getTickColor() }
                }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false }
        }
    });
}

// --- 5. EVENT LISTENERS & EXPORTS ---
document.addEventListener('DOMContentLoaded', () => {
    initDashboard();

    const filterOptions = document.querySelectorAll('.filter-option');
    const filterLabel = document.getElementById('time-filter-label');
    const filterMenu = document.getElementById('time-filter-menu');

    window.currentChartFilter = 'weekly'; 

    filterOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            const val = e.target.dataset.value;
            const text = e.target.innerText;
            window.currentChartFilter = val;

            if (filterLabel) filterLabel.innerText = text;

            // VISUAL FIX: Updated active filter logic to support dark mode colors
            filterOptions.forEach(opt => {
                opt.classList.remove('text-primary', 'dark:text-blue-400', 'font-bold', 'bg-primary/5', 'dark:bg-blue-500/10');
                opt.classList.add('text-on-surface', 'dark:text-gray-300');
            });
            e.target.classList.remove('text-on-surface', 'dark:text-gray-300');
            e.target.classList.add('text-primary', 'dark:text-blue-400', 'font-bold', 'bg-primary/5', 'dark:bg-blue-500/10');

            if (filterMenu) filterMenu.classList.add('opacity-0', 'invisible', 'translate-y-2');

            switch(val) {
                case 'today':
                    renderLineChart(dashboardData.salesTrendToday, 'Today (Hourly)');
                    break;
                case 'weekly':
                    renderLineChart(dashboardData.salesTrendWeekly, 'Last 7 Days');
                    break;
                case 'monthly':
                    renderLineChart(dashboardData.salesTrendMonthly, 'This Month');
                    break;
                case '3months':
                    renderLineChart(dashboardData.salesTrend3Months, 'Last 3 Months');
                    break;
                case '6months':
                    renderLineChart(dashboardData.salesTrend6Months, 'Last 6 Months');
                    break;
            }
        });
    });

    const downloadCSV = (csvStr, filename) => {
        let blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
        let link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    document.getElementById('export-pie')?.addEventListener('click', () => {
        let csv = 'Party Name,Total Units Transferred\n';
        if(dashboardData.topParties) {
            dashboardData.topParties.forEach(p => csv += `"${p.party_name}",${p.total_units}\n`);
        }
        downloadCSV(csv, 'top-consuming-parties.csv');
    });

    document.getElementById('export-line')?.addEventListener('click', () => {
        const filterVal = window.currentChartFilter || 'weekly';
        let dataToExport = [];
        
        if(filterVal === 'today') dataToExport = dashboardData.salesTrendToday;
        else if(filterVal === 'monthly') dataToExport = dashboardData.salesTrendMonthly;
        else if(filterVal === '3months') dataToExport = dashboardData.salesTrend3Months;
        else if(filterVal === '6months') dataToExport = dashboardData.salesTrend6Months;
        else dataToExport = dashboardData.salesTrendWeekly;

        let csv = 'Time Period,Total Units Transferred\n';
        if(dataToExport) {
            dataToExport.forEach(d => csv += `"${d.label}",${d.total}\n`);
        }
        downloadCSV(csv, `logistics-summary-${filterVal}.csv`);
    });
});

async function fetchAndRenderLogs() {
    const logsContainer = document.getElementById('admin-logs-section');
    const logsBody = document.getElementById('logs-body');
    const token = localStorage.getItem('token');

    if (!logsContainer) return;
    if (!logsBody) return;
    if (!token) return;

    try {
        const response = await fetch(`${API_BASE}/admin/logs`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 403) {
            console.warn("Non-admin user tried to access logs.");
            return; 
        }

        const logs = await response.json();
        
        logsContainer.classList.remove('hidden');
        
        // VISUAL FIX: Admin logs dark mode
        logsBody.innerHTML = logs.map(log => `
            <tr class="hover:bg-surface-container-low dark:hover:bg-gray-800/40 border-b border-gray-100 dark:border-gray-800/50 transition-colors">
                <td class="py-3 font-medium text-on-surface dark:text-gray-200">${log.username || 'System'}</td>
                <td class="py-3 text-blue-600 dark:text-blue-400 font-bold">${log.action}</td>
                <td class="py-3 text-on-surface dark:text-gray-300">${log.table_name}</td>
                <td class="py-3 text-gray-500 dark:text-gray-500">${new Date(log.created_at).toLocaleString()}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error("Failed to load logs:", err);
    }
}

document.addEventListener('DOMContentLoaded', fetchAndRenderLogs);

// VISUAL FIX: Listen to the global theme toggle event to instantly redraw charts
window.addEventListener('themeChanged', () => {
    if (lineChartInstance) {
        lineChartInstance.options.scales.x.ticks.color = getTickColor();
        lineChartInstance.options.scales.y.grid.color = getGridColor();
        lineChartInstance.options.scales.y.ticks.color = getTickColor();
        lineChartInstance.update();
    }
    if (pieChartInstance) {
        pieChartInstance.update(); // Forces the centerTextPlugin to re-read the color
    }
});
