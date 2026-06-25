// js/layout.js

// --- GLOBAL LOADER SYSTEM (Bulletproof CSS Version) ---
function injectGlobalLoader() {
    if (document.getElementById('global-loader-overlay')) return;

    const loaderStyle = `
        <style>
            #global-loader-overlay {
                position: fixed;
                inset: 0;
                z-index: 99999;
                background-color: rgba(255, 255, 255, 0.7);
                backdrop-filter: blur(4px);
                -webkit-backdrop-filter: blur(4px);
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.3s ease, visibility 0.3s ease;
            }
            
            html.dark #global-loader-overlay {
                background-color: rgba(15, 15, 17, 0.8);
            }

            #global-loader-overlay.active {
                opacity: 1;
                visibility: visible;
            }

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
                background: #4c5b71; 
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

    const loaderHTML = `
        <div id="global-loader-overlay">
            <div class="loader"></div>
        </div>
    `;
    
    document.head.insertAdjacentHTML('beforeend', loaderStyle);
    document.body.insertAdjacentHTML('beforeend', loaderHTML);
}

injectGlobalLoader();

// Export the controls
export function showLoader() {
    const overlay = document.getElementById('global-loader-overlay');
    if (overlay) overlay.classList.add('active');
}

export function hideLoader() {
    const overlay = document.getElementById('global-loader-overlay');
    if (overlay) overlay.classList.remove('active');
}

// FIX 2: BFCache / Browser Back Button safeguard
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        hideLoader();
    }
});

// --- EXISTING SIDEBAR & LOGOUT LOGIC ---
export async function loadSidebar() {
    try {
        const response = await fetch('sidebar.html');
        if (!response.ok) throw new Error("Sidebar template could not be loaded.");
        
        const html = await response.text();
        const container = document.getElementById('sidebar-container');
        if (!container) return;
        container.innerHTML = html;

        setupLogout();

        const userRole = localStorage.getItem('user_role');
        if (userRole !== 'admin') {
            const adminElements = document.querySelectorAll('.admin-only');
            adminElements.forEach(el => el.remove());
        }

        // FIX 3: Stripped query parameters to prevent active-link bugs
        let rawPage = window.location.pathname.split('/').pop() || "dashboard.html";
        let currentPage = rawPage.split('?')[0].split('#')[0]; 
        if (currentPage === "index.html" || currentPage === "") currentPage = "dashboard.html";

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

// --- FIX 1: GLOBAL PAGE TRANSITION INTERCEPTOR ---
// This sits outside the sidebar loop and catches ALL links on the page.
document.addEventListener('click', (e) => {
    // Check if the clicked element (or its parent) is a standard anchor link
    const link = e.target.closest('a');
    
    if (link) {
        const href = link.getAttribute('href');
        const target = link.getAttribute('target');
        
        // Validate it's a real navigation link
        if (href && 
            !href.startsWith('#') && 
            !href.startsWith('javascript:') && 
            target !== '_blank' && 
            !link.hasAttribute('download')) {
            
            // Allow native OS behavior for new tabs (Ctrl/Cmd + Click)
            if (e.ctrlKey || e.metaKey || e.shiftKey) return;

            e.preventDefault(); 
            showLoader(); 
            
            setTimeout(() => {
                window.location.href = href;
            }, 150);
        }
    }
});