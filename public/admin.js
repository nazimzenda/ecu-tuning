// Admin panel functionality with authentication
let orders = [];
let adminSessionId = null;

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginSection = document.getElementById('loginSection');
    const adminPanelSection = document.getElementById('adminPanelSection');
    const logoutBtn = document.getElementById('logoutBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const ordersList = document.getElementById('ordersList');
    const modal = document.getElementById('orderModal');
    const modalClose = document.querySelector('.modal-close');

    // Check if already logged in (session stored in localStorage)
    adminSessionId = localStorage.getItem('adminSessionId');
    if (adminSessionId) {
        checkSession();
    }

    // Login form handler
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('adminPassword').value;
        const messageDiv = document.getElementById('loginMessage');

        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            // Check if response is OK before parsing JSON
            if (!response.ok) {
                // Try to get error message from response
                let errorMessage = 'Invalid password';
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    errorMessage = `Server error: ${response.status} ${response.statusText}`;
                }
                messageDiv.textContent = errorMessage;
                messageDiv.className = 'message error show';
                return;
            }

            const data = await response.json();

            if (data.success && data.sessionId) {
                adminSessionId = data.sessionId;
                localStorage.setItem('adminSessionId', adminSessionId);
                showAdminPanel();
                loadOrders();
            } else {
                messageDiv.textContent = data.error || 'Login failed';
                messageDiv.className = 'message error show';
            }
        } catch (error) {
            console.error('Login error:', error);
            let errorMsg = 'Network error. ';
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                errorMsg += 'Cannot connect to server. Please make sure the server is running on http://localhost:3000';
            } else {
                errorMsg += error.message + '. Please check if server is running.';
            }
            messageDiv.textContent = errorMsg;
            messageDiv.className = 'message error show';
        }
    });

    // Logout handler
    logoutBtn.addEventListener('click', async () => {
        if (adminSessionId) {
            try {
                await fetch('/api/admin/logout', {
                    method: 'POST',
                    headers: { 'x-admin-session': adminSessionId }
                });
            } catch (error) {
                console.error('Logout error:', error);
            }
        }
        adminSessionId = null;
        localStorage.removeItem('adminSessionId');
        showLoginScreen();
    });

    // Refresh button
    refreshBtn.addEventListener('click', () => {
        loadOrders();
    });

    // Modal close
    if (modalClose) {
        modalClose.addEventListener('click', () => {
            modal.classList.remove('show');
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });

    function showLoginScreen() {
        loginSection.style.display = 'block';
        adminPanelSection.style.display = 'none';
    }

    function showAdminPanel() {
        loginSection.style.display = 'none';
        adminPanelSection.style.display = 'block';
    }

    async function checkSession() {
        try {
            const response = await fetch('/api/orders', {
                headers: { 'x-admin-session': adminSessionId }
            });
            if (response.ok) {
                showAdminPanel();
                loadOrders();
            } else {
                adminSessionId = null;
                localStorage.removeItem('adminSessionId');
                showLoginScreen();
            }
        } catch (error) {
            adminSessionId = null;
            localStorage.removeItem('adminSessionId');
            showLoginScreen();
        }
    }

    async function loadOrders() {
        if (!adminSessionId) return;

        try {
            const response = await fetch('/api/orders', {
                headers: { 'x-admin-session': adminSessionId }
            });

            if (response.status === 401) {
                adminSessionId = null;
                localStorage.removeItem('adminSessionId');
                showLoginScreen();
                return;
            }

            orders = await response.json();
            renderOrders();
            updateStats();
        } catch (error) {
            console.error('Error loading orders:', error);
            ordersList.innerHTML = '<div class="loading">Error loading orders. Please try again.</div>';
        }
    }

    function updateStats() {
        const total = orders.length;
        const pending = orders.filter(o => o.status === 'pending').length;
        const processing = orders.filter(o => o.status === 'processing').length;
        const completed = orders.filter(o => o.status === 'completed').length;

        document.getElementById('totalOrders').textContent = total;
        document.getElementById('pendingOrders').textContent = pending;
        document.getElementById('processingOrders').textContent = processing;
        document.getElementById('completedOrders').textContent = completed;
    }

    function renderOrders() {
        if (orders.length === 0) {
            ordersList.innerHTML = '<div class="loading">No orders yet.</div>';
            return;
        }

        ordersList.innerHTML = orders.map(order => {
            const customDesc = order.custom_service_description 
                ? `<div class="order-info-item" style="grid-column: 1 / -1;">
                    <div class="order-info-label">Custom Service Description</div>
                    <div class="order-info-value" style="background: var(--dark-gray); padding: 1rem; border-radius: 6px; white-space: pre-wrap; color: var(--primary-yellow);">${order.custom_service_description}</div>
                   </div>`
                : '';

            return `
            <div class="order-card">
                <div class="order-header">
                    <div>
                        <div class="order-id">Order #${String(order.id).padStart(3, '0')}</div>
                        <div style="color: var(--text-dark); font-size: 0.9rem; margin-top: 0.25rem;">
                            ${new Date(order.created_at).toLocaleString()}
                        </div>
                    </div>
                    <span class="order-status ${order.status}">${order.status}</span>
                </div>
                <div class="order-info">
                    <div class="order-info-item">
                        <div class="order-info-label">File</div>
                        <div class="order-info-value">${order.original_file_name}</div>
                    </div>
                    <div class="order-info-item">
                        <div class="order-info-label">Service</div>
                        <div class="order-info-value">${order.service}</div>
                    </div>
                    <div class="order-info-item">
                        <div class="order-info-label">Vehicle</div>
                        <div class="order-info-value">${order.vehicle_info}</div>
                    </div>
                    <div class="order-info-item">
                        <div class="order-info-label">Customer</div>
                        <div class="order-info-value">${order.customer_name || 'N/A'}</div>
                    </div>
                    <div class="order-info-item">
                        <div class="order-info-label">Email</div>
                        <div class="order-info-value">${order.customer_email || 'N/A'}</div>
                    </div>
                    <div class="order-info-item">
                        <div class="order-info-label">WhatsApp</div>
                        <div class="order-info-value">${order.customer_phone || 'N/A'}</div>
                    </div>
                    ${customDesc}
                </div>
                <div class="order-actions">
                    <button class="btn btn-secondary" onclick="downloadOriginal(${order.id})">
                        📥 Download Original
                    </button>
                    ${order.status !== 'completed' ? `
                        <button class="btn btn-warning" onclick="updateStatus(${order.id}, 'processing')">
                            ⚙️ Mark Processing
                        </button>
                    ` : ''}
                    ${order.status === 'processing' ? `
                        <button class="btn btn-success" onclick="showUploadModal(${order.id})">
                            📤 Upload Modified
                        </button>
                    ` : ''}
                    ${order.modified_file_path ? `
                        <button class="btn btn-primary" onclick="downloadModified(${order.id})">
                            ✅ Download Modified
                        </button>
                    ` : ''}
                    <button class="btn btn-danger" onclick="deleteOrder(${order.id})">
                        🗑️ Delete
                    </button>
                </div>
            </div>
        `;
        }).join('');
    }

    // Global functions for order actions
    window.downloadOriginal = (orderId) => {
        window.open(`/api/orders/${orderId}/download/original?session=${adminSessionId}`, '_blank');
    };

    window.downloadModified = (orderId) => {
        window.open(`/api/orders/${orderId}/download/modified?session=${adminSessionId}`, '_blank');
    };

    window.updateStatus = async (orderId, status) => {
        try {
            const response = await fetch(`/api/orders/${orderId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-session': adminSessionId
                },
                body: JSON.stringify({ status })
            });

            if (response.status === 401) {
                adminSessionId = null;
                localStorage.removeItem('adminSessionId');
                showLoginScreen();
                return;
            }

            if (response.ok) {
                loadOrders();
            } else {
                alert('Failed to update status');
            }
        } catch (error) {
            console.error('Error updating status:', error);
            alert('Error updating status');
        }
    };

    window.showUploadModal = (orderId) => {
        const order = orders.find(o => o.id === orderId);
        if (!order) return;

        document.getElementById('modalTitle').textContent = `Upload Modified File - Order #${String(orderId).padStart(3, '0')}`;
        document.getElementById('modalBody').innerHTML = `
            <form id="uploadModifiedForm" onsubmit="uploadModifiedFile(event, ${orderId})">
                <div class="form-group">
                    <label for="modifiedFile">Select Modified File</label>
                    <input type="file" id="modifiedFile" name="modifiedFile" 
                           accept=".bin,.hex,.ori,.winols,.dam" required>
                </div>
                <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 1rem;">
                    Upload Modified File
                </button>
            </form>
        `;
        modal.classList.add('show');
    };

    window.uploadModifiedFile = async (e, orderId) => {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const fileInput = form.querySelector('#modifiedFile');

        if (!fileInput.files[0]) {
            alert('Please select a file');
            return;
        }

        try {
            const response = await fetch(`/api/orders/${orderId}/modified`, {
                method: 'POST',
                headers: { 'x-admin-session': adminSessionId },
                body: formData
            });

            if (response.status === 401) {
                adminSessionId = null;
                localStorage.removeItem('adminSessionId');
                showLoginScreen();
                return;
            }

            const data = await response.json();

            if (response.ok) {
                alert('Modified file uploaded successfully!');
                modal.classList.remove('show');
                loadOrders();
            } else {
                alert(`Error: ${data.error || 'Failed to upload file'}`);
            }
        } catch (error) {
            console.error('Error uploading file:', error);
            alert('Error uploading file');
        }
    };

    window.deleteOrder = async (orderId) => {
        if (!confirm('Are you sure you want to delete this order? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch(`/api/orders/${orderId}`, {
                method: 'DELETE',
                headers: { 'x-admin-session': adminSessionId }
            });

            if (response.status === 401) {
                adminSessionId = null;
                localStorage.removeItem('adminSessionId');
                showLoginScreen();
                return;
            }

            if (response.ok) {
                loadOrders();
            } else {
                alert('Failed to delete order');
            }
        } catch (error) {
            console.error('Error deleting order:', error);
            alert('Error deleting order');
        }
    };
});
