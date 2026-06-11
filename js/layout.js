// js/layout.js
export async function loadSidebar() {
    try {
        const response = await fetch('sidebar.html');
        if (!response.ok) throw new Error("Sidebar template could not be loaded.");
        
        const html = await response.text();
        
        // Inject the sidebar into the container
        document.getElementById('sidebar-container').innerHTML = html;

        // Determine current page filename string
        let currentPage = window.location.pathname.split('/').pop();
        if (currentPage === "" || currentPage === "index.html") {
            currentPage = "dashboard.html"; 
        }

        // Apply active styling to DOM nodes matrix
        const links = document.querySelectorAll('#nav-links .nav-link');
        
        links.forEach(link => {
            const linkPage = link.getAttribute('data-page');
            
            // DYNAMIC EVALUATION: Checks if the page matches exactly, 
            // OR if we are on create-challan.html, keep the main Challan Hub active!
            const isMatch = (linkPage === currentPage) || 
                            (linkPage === "challan.html" && currentPage === "create-challan.html");
            
            // Locate internal icon and text nodes for fine-tuned transformation control
            const icon = link.querySelector('.material-symbols-outlined');
            const indicator = link.querySelector('.active-indicator');
            
            if (isMatch) {
                // 1. ACTIVE STATE: Deep background fill, primary color accent, custom indicator line glides into place
                link.className = "nav-link relative flex items-center gap-3 px-4 py-3 bg-[#4c5b71]/10 text-[#4c5b71] font-bold rounded-xl shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-300 cursor-default no-underline group overflow-hidden";
                
                // Force Material Icon to solid state weight
                if (icon) {
                    icon.style.fontVariationSettings = "'FILL' 1, 'wght' 600";
                }
                
                // Slide the left indicator line into visible range
                if (indicator) {
                    indicator.className = "active-indicator absolute left-0 top-1/4 bottom-1/4 w-1 bg-[#4c5b71] rounded-full transform translate-x-0 opacity-100 transition-all duration-300 ease-out";
                }
            } else {
                // 2. INACTIVE STATE: Transparent backdrop, elegant hover easing, deeper shadows on interaction
                link.className = "nav-link relative flex items-center gap-3 px-4 py-3 text-gray-500 hover:bg-[#f5f3f5] hover:text-[#4c5b71] hover:shadow-[0_4px_12px_rgba(0,0,0,0.03)] rounded-xl transition-all duration-300 ease-out cursor-pointer no-underline group overflow-hidden active:scale-[0.98]";
                
                // Keep icon hollow and clean
                if (icon) {
                    icon.style.fontVariationSettings = "'FILL' 0, 'wght' 400";
                }
                
                // Hide indicator line outside the container bounds
                if (indicator) {
                    indicator.className = "active-indicator absolute left-0 top-1/4 bottom-1/4 w-1 bg-[#4c5b71] rounded-full transform -translate-x-full opacity-0 transition-all duration-300 ease-out";
                }
            }
        });

    } catch (error) {
        console.error("Failed to load sidebar structure:", error);
    }
}