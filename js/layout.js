// js/layout.js

// --- GLOBAL LOADER SYSTEM ---
function injectGlobalLoader() {
    // Prevent injecting it twice
    if (document.getElementById('global-loader-overlay')) return;

    // 1. Inject the CSS styles directly into the document head
    const loaderStyle = `
        <style>
            .loader {
                height: 60px;
                aspect-ratio: 2;
                border-bottom: 3px solid #0000;
                background: 
                    linear-gradient(90deg,#524656 50%,#0000 0)
                    -25% 100%/50% 3px repeat-x border-box;
                position: relative;
                animation: l3-0 .75s linear infinite;
            }
            .loader:before {
                content: "";
                position: absolute;
                inset: auto 42.5% 0;
                aspect-ratio: 1;
                border-radius: 50%;
                background: #4c5b71; /* Changed to your theme's primary color! */
                animation: l3-1 .75s cubic-bezier(0,900,1,900) infinite;
            }
            @keyframes l3-0 {
                to {background-position: -125% 100%}
            }
            @keyframes l3-1 {
                0%,2% {bottom: 0%}
                98%,to {bottom:.1%}
            }
        </style>
    `;

    // 2. Inject the Loader HTML overlay
    const loaderHTML = `
        <div id="global-loader-overlay" class="fixed inset-0 z-[9999] bg-white/70 dark:bg-[#0f0f11]/80 backdrop-blur-sm flex items-center justify-center opacity-0 invisible transition-all duration-300">
            <div class="loader"></div>
        </div>
    `;
    
    document.head.insertAdjacentHTML('beforeend', loaderStyle);
    document.body.insertAdjacentHTML('beforeend', loaderHTML);
}

// Initialize the loader as soon as this file is read
injectGlobalLoader();

// Export the controls so other files can turn it on and off
export function showLoader() {
    const overlay = document.getElementById('global-loader-overlay');
    if (overlay) overlay.classList.remove('opacity-0', 'invisible');
}

export function hideLoader() {
    const overlay = document.getElementById('global-loader-overlay');
    if (overlay) overlay.classList.add('opacity-0', 'invisible');
}


// --- EXISTING SIDEBAR & LOGOUT LOGIC ---
export async function loadSidebar() {
    try {
        const response = await fetch('sidebar.html');
        if (!response.ok) throw new Error("Sidebar template could not be loaded.");
        
        const html = await response.text();
        const container = document.getElementById('sidebar-container');
        if (!container) return;
        container.innerHTML = html;

        // --- FIX: CALL LOGOUT SETUP HERE AFTER HTML IS INJECTED ---
        setupLogout();

        // Role-based filtering
        const userRole = localStorage.getItem('user_role');
        if (userRole !== 'admin') {
            const adminElements = document.querySelectorAll('.admin-only');
            adminElements.forEach(el => el.remove());
        }

        // Active Link Logic
        let currentPage = window.location.pathname.split('/').pop() || "dashboard.html";
        if (currentPage === "index.html") currentPage = "dashboard.html";

        const links = document.querySelectorAll('#nav-links .nav-link');
        links.forEach(link => {
            const linkPage = link.getAttribute('data-page');
            const isMatch = (linkPage === currentPage) || 
                            (linkPage === "challan.html" && currentPage === "create-challan.html");
            
            const icon = link.querySelector('.material-symbols-outlined');
            const indicator = link.querySelector('.active-indicator');
            
            if (isMatch) {
                link.className = "nav-link relative flex items-center gap-3 px-4 py-3 bg-[#4c5b71]/10 text-[#4c5b71] font-bold rounded-xl shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-300 cursor-default no-underline group overflow-hidden";
                if (icon) icon.style.fontVariationSettings = "'FILL' 1, 'wght' 600";
                if (indicator) indicator.className = "active-indicator absolute left-0 top-1/4 bottom-1/4 w-1 bg-[#4c5b71] rounded-full transform translate-x-0 opacity-100 transition-all duration-300 ease-out";
            } else {
                link.className = "nav-link relative flex items-center gap-3 px-4 py-3 text-gray-500 hover:bg-[#f5f3f5] hover:text-[#4c5b71] hover:shadow-[0_4px_12px_rgba(0,0,0,0.03)] rounded-xl transition-all duration-300 ease-out cursor-pointer no-underline group overflow-hidden active:scale-[0.98]";
                if (icon) icon.style.fontVariationSettings = "'FILL' 0, 'wght' 400";
                if (indicator) indicator.className = "active-indicator absolute left-0 top-1/4 bottom-1/4 w-1 bg-[#4c5b71] rounded-full transform -translate-x-full opacity-0 transition-all duration-300 ease-out";
            }
        });
    } catch (error) {
        console.error("Failed to load sidebar structure:", error);
    }
}

export function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('token');
            localStorage.removeItem('user_role');
            window.location.href = 'login.html';
        });
    }
}