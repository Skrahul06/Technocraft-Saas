 const API_BASE = 'https://technocraft-saas.onrender.com/api';
//const API_BASE = 'http://localhost:5000/api';

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // UI Elements
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('error-msg');
    const submitBtn = e.target.querySelector('button');

    // Prevent double submission
    submitBtn.disabled = true;
    errorEl.classList.add('hidden');

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            // 1. Save data to storage
            localStorage.setItem('token', data.token);
            localStorage.setItem('user_role', data.role);
            
            // 2. Redirect based on role
            if (data.role === 'admin') {
                window.location.href = 'dashboard.html';
            } else {
                window.location.href = 'challan.html';
            }
        } else {
            // Display specific error from server
            errorEl.innerText = data.error || 'Login failed. Check your credentials.';
            errorEl.classList.remove('hidden');
        }
    } catch (err) {
        console.error("Login Error:", err);
        errorEl.innerText = 'Server unreachable. Please check your backend connection.';
        errorEl.classList.remove('hidden');
    } finally {
        submitBtn.disabled = false;
    }
});
