// js/api.js
const API_BASE_URL = 'http://localhost:5000/api';

export async function fetchChallans() {
    try {
        const response = await fetch(`${API_BASE_URL}/challans`);
        if (!response.ok) throw new Error('Failed to connect to backend');
        
        const dbChallans = await response.json();

        // Map the PostgreSQL database fields to match your HTML's exact expectations
        return dbChallans.map(challan => ({
            id: challan.challan_number, 
            date: new Date(challan.date).toLocaleDateString(), // Formats to MM/DD/YYYY
            client: challan.party_name || 'Unknown Party', // Pulled from the SQL JOIN
            type: challan.type === 'In' ? 'Vendor Inbound' : 'Customer Outbound',
            amount: `$${parseFloat(challan.total_amount).toFixed(2)}`,
            status: challan.status
        }));
    } catch (error) {
        console.error("Error fetching challans from API:", error);
        return []; // Return empty array so the UI doesn't crash
    }
}