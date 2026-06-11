// js/dashboard.js
const API_BASE = 'https://technocraft-saas.onrender.com/api';

let dashboardData = {};
let lineChartInstance = null;
let pieChartInstance = null;

// --- 1. ANIMATION & UI HELPERS ---
// js/dashboard.js

function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const currentVal = Math.floor(progress * (end - start) + start);
        
        // FIX: Clean Indian Rupee formatting mapping (Lakhs / Crores partitioning)
        obj.innerHTML = new Intl.NumberFormat('en-IN', { 
            style: 'currency', 
            currency: 'INR',
            maximumFractionDigits: 0 // Optional: hides paise for cleaner dashboard layout
        }).format(currentVal);
        
        if (progress < 1) window.requestAnimationFrame(step);
        else obj.innerHTML = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(end);
    };
    window.requestAnimationFrame(step);
}

function updateTrendUI(elementId, percentage) {
    const el = document.getElementById(elementId);
    const val = parseFloat(percentage);
    
    const baseClasses = "text-label-md font-label-md mt-1 flex items-center gap-1 ";
    
    if (val > 0) {
        el.innerHTML = `<span class="material-symbols-outlined text-[14px]">arrow_upward</span> +${val}% from last month`;
        el.className = baseClasses + "text-[#059669]"; 
    } else if (val < 0) {
        el.innerHTML = `<span class="material-symbols-outlined text-[14px]">arrow_downward</span> ${val}% from last month`;
        el.className = baseClasses + "text-[#ba1a1a]"; 
    } else {
        el.innerHTML = `<span class="material-symbols-outlined text-[14px]">horizontal_rule</span> 0.0% from last month`;
        el.className = baseClasses + "text-on-surface-variant"; 
    }
}

function getTypeBadge(type) {
    const baseClasses = "px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide uppercase inline-block text-center whitespace-nowrap";
    const colors = {
        'In': 'bg-emerald-50 text-emerald-700',
        'Out': 'bg-blue-50 text-blue-700',
        'Sales Return': 'bg-rose-50 text-rose-700',
        'Purchase Return': 'bg-orange-50 text-orange-700'
    };
    return `<span class="${baseClasses} ${colors[type] || 'bg-gray-50 text-gray-600'}">${type}</span>`;
}

// 2. Fixed Status Logic
function getStatusBadge(status) {
    const baseClasses = "px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide uppercase inline-block text-center whitespace-nowrap";
    if (status === 'Paid') return `<span class="${baseClasses} bg-emerald-50 text-emerald-700">Paid</span>`;
    if (status === 'Pending') return `<span class="${baseClasses} bg-amber-50 text-amber-700">Pending</span>`;
    return `<span class="${baseClasses} bg-gray-50 text-gray-600">${status}</span>`;
}
// --- 2. DATA FETCHING ---
async function initDashboard() {
    try {
        const response = await fetch(`${API_BASE}/dashboard/stats`);
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
        renderPieChart(dashboardData.topProducts);
        renderLineChart(dashboardData.salesTrendWeekly, 'Weekly Sales');
        
        // Render Bottom Sections
        renderRecentTransactions(dashboardData.recentTransactions);
        renderLowStockAlerts(dashboardData.lowStockAlerts);

    } catch (error) {
        console.error("Dashboard Error:", error);
        
        // Show clear error status in the tables instead of freezing on "Loading..."
        document.getElementById('recent-transactions-body').innerHTML = `
            <tr>
                <td colspan="5" class="py-6 text-center text-[#ba1a1a] font-medium">
                    <span class="material-symbols-outlined vertical-align-middle mr-1 text-[18px]">error</span>
                    Failed to connect to backend server.
                </td>
            </tr>
        `;
        
        document.getElementById('low-stock-container').innerHTML = `
            <div class="flex flex-col items-center justify-center py-6 text-[#ba1a1a]">
                <span class="material-symbols-outlined text-[32px] mb-1">cloud_off</span>
                <p class="text-xs font-medium">Server offline or query failed.</p>
            </div>
        `;
    }
}

// --- 3. RENDERING FUNCTIONS ---

function renderRecentTransactions(transactions) {
    const tbody = document.getElementById('recent-transactions-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-md text-center text-on-surface-variant">No transactions found.</td></tr>`;
        return;
    }

    // Only iterate over the first 5 transactions
    transactions.slice(0, 5).forEach(t => {
        const dateObj = new Date(t.date);
        const formattedDate = dateObj.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
        const formattedAmount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(t.total_amount);

        tbody.innerHTML += `
            <tr class="border-b border-surface-container-low hover:bg-surface transition-colors">
                <td class="py-3 text-on-surface font-semibold text-sm">#${t.challan_number}</td>
                <td class="py-3 text-on-surface-variant text-sm">${formattedDate}</td>
                <td class="py-3 text-on-surface text-sm font-medium">${t.party_name || 'N/A'}</td>
                
                <td class="py-3">${getStatusBadge(t.status)}</td>
                <td class="py-3 text-right font-bold text-on-surface text-sm">${formattedAmount}</td>
            </tr>
        `;
    });
}

// Render Bottom 30% Alerts List
function renderLowStockAlerts(alerts) {
    const container = document.getElementById('low-stock-container');
    container.innerHTML = '';

    if (!alerts || alerts.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-6 text-on-surface-variant">
                <span class="material-symbols-outlined text-[40px] mb-2 text-surface-dim">check_circle</span>
                <p class="text-sm font-medium">All stock levels are healthy.</p>
            </div>
        `;
        return;
    }

    alerts.forEach(item => {
        container.innerHTML += `
            <div class="flex items-center gap-md p-2 hover:bg-surface rounded-lg transition-colors group cursor-pointer">
                <div class="w-10 h-10 bg-error/10 text-error rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-error group-hover:text-white transition-colors">
                    <span class="material-symbols-outlined text-[20px]">inventory_2</span>
                </div>
                <div class="flex-grow min-w-0">
                    <p class="font-bold text-on-surface text-sm truncate pr-2">${item.name}</p>
                    <p class="text-[11px] text-outline-variant truncate">SKU: ${item.sku}</p>
                </div>
                <div class="text-right flex-shrink-0">
                    <p class="font-bold text-[#ba1a1a] text-sm">${item.current_stock} Units</p>
                    <button class="text-[11px] text-primary hover:text-primary-fixed-variant hover:underline font-semibold mt-0.5 transition-colors">Reorder</button>
                </div>
            </div>
        `;
    });
}

const themeColors = ['#4c5b71', '#64748b', '#94a3b8', '#cbd5e1'];

const centerTextPlugin = {
    id: 'centerText',
    beforeDraw: function(chart) {
        if (chart.config.type !== 'doughnut') return;
        var width = chart.width, height = chart.height, ctx = chart.ctx;
        ctx.restore();
        
        const total = chart.config.data.datasets[0].data.reduce((a, b) => a + b, 0);
        const compactTotal = Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(total);
        
        ctx.font = "bold 24px 'Hanken Grotesk'";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#1b1b1d";
        var textX = Math.round((width - ctx.measureText(compactTotal).width) / 2), textY = height / 2 - 8;
        ctx.fillText(compactTotal, textX, textY);
        
        ctx.font = "600 11px 'Hanken Grotesk'";
        ctx.fillStyle = "#64748b";
        var label = "TOTAL UNITS";
        var labelX = Math.round((width - ctx.measureText(label).width) / 2), labelY = height / 2 + 14;
        ctx.fillText(label, labelX, labelY);
        ctx.save();
    }
};

function renderPieChart(productsData) {
    const ctx = document.getElementById('pieChart').getContext('2d');
    const labels = productsData.length ? productsData.map(p => p.name) : ['No Data Yet'];
    const data = productsData.length ? productsData.map(p => parseFloat(p.total_sold)) : [1];

    if (pieChartInstance) pieChartInstance.destroy();

    pieChartInstance = new Chart(ctx, {
        type: 'doughnut',
        plugins: [centerTextPlugin],
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: themeColors,
                borderWidth: 0,
                hoverOffset: 10 
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '80%', 
            plugins: {
                legend: { display: false }, 
                tooltip: { 
    backgroundColor: 'rgba(27, 27, 29, 0.95)', 
    padding: 12,              // FIX: Forces the box walls to expand outward on all sides
    boxPadding: 8,            // FIX: Pushes the text away from the colored icon square
    cornerRadius: 8,          // Matches your smooth Material UI design tokens
    titleFont: { family: 'Hanken Grotesk', size: 14, weight: 'bold' },
    bodyFont: { family: 'Hanken Grotesk', size: 13 },
    callbacks: { 
        // FIX: Don't repeat the product name if it's already the title!
        label: (context) => {
            const formattedVal = Intl.NumberFormat('en-US', {notation: "compact"}).format(context.raw);
            return ` Quantity Sold: ${formattedVal} Units`;
        }
    } 
}
            },
            animation: { animateScale: true, animateRotate: true, duration: 2000, easing: 'easeOutQuart' }
        }
    });

    const legendContainer = document.getElementById('custom-pie-legend');
    legendContainer.innerHTML = '';
    labels.forEach((label, index) => {
        const color = themeColors[index % themeColors.length];
        legendContainer.innerHTML += `
            <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full flex-shrink-0" style="background-color: ${color}"></div>
                <span class="text-sm font-semibold text-[#64748b] truncate" title="${label}">${label}</span>
            </div>
        `;
    });
}

function renderLineChart(trendData, datasetLabel) {
    const ctx = document.getElementById('lineChart').getContext('2d');
    const labels = trendData.length ? trendData.map(t => t.label) : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const data = trendData.length ? trendData.map(t => parseFloat(t.total)) : [0, 0, 0, 0, 0, 0, 0];

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
                    callbacks: { label: (context) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'INR' }).format(context.parsed.y) }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { family: 'Hanken Grotesk', weight: 'bold' }, color: '#64748b' } },
                y: { 
                    beginAtZero: true, border: { display: false }, grid: { color: '#f1f5f9', borderDash: [5, 5] },
                    ticks: { font: { family: 'Hanken Grotesk', weight: 'bold' }, color: '#64748b', callback: (value) => '₹' + value }
                }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false }
        }
    });
}

// --- 4. TOGGLES & CSV EXPORTS ---
document.addEventListener('DOMContentLoaded', () => {
    initDashboard();

    const btnWeekly = document.getElementById('btn-weekly');
    const btnMonthly = document.getElementById('btn-monthly');

    btnWeekly.addEventListener('click', () => {
        btnWeekly.classList.add('bg-surface-container-lowest', 'text-primary', 'shadow-[0px_4px_20px_rgba(0,0,0,0.03)]');
        btnMonthly.classList.remove('bg-surface-container-lowest', 'text-primary', 'shadow-[0px_4px_20px_rgba(0,0,0,0.03)]');
        renderLineChart(dashboardData.salesTrendWeekly, 'Weekly Sales');
    });

    btnMonthly.addEventListener('click', () => {
        btnMonthly.classList.add('bg-surface-container-lowest', 'text-primary', 'shadow-[0px_4px_20px_rgba(0,0,0,0.03)]');
        btnWeekly.classList.remove('bg-surface-container-lowest', 'text-primary', 'shadow-[0px_4px_20px_rgba(0,0,0,0.03)]');
        renderLineChart(dashboardData.salesTrendMonthly, 'Monthly Sales');
    });

    const downloadCSV = (csvStr, filename) => {
        let blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
        let link = document.createElement("a");
        let url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    document.getElementById('export-pie').addEventListener('click', () => {
        let csv = 'Product Name,Total Units Sold\n';
        dashboardData.topProducts.forEach(p => csv += `"${p.name}",${p.total_sold}\n`);
        downloadCSV(csv, 'top-selling-products.csv');
    });

    document.getElementById('export-line').addEventListener('click', () => {
        const isWeekly = btnWeekly.classList.contains('bg-surface-container-lowest');
        const dataToExport = isWeekly ? dashboardData.salesTrendWeekly : dashboardData.salesTrendMonthly;
        let csv = isWeekly ? 'Day,Total Sales Revenue\n' : 'Month,Total Sales Revenue\n';
        dataToExport.forEach(d => csv += `"${d.label}",${d.total}\n`);
        downloadCSV(csv, `sales-summary-${isWeekly ? 'weekly' : 'monthly'}.csv`);
    });
});