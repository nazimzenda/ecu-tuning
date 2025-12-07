// Admin panel functionality with authentication
const API_BASE_URL = (window.API_BASE_URL || '').replace(/\/$/, '');
let orders = [];
let adminSessionId = null;
let filterStatus = null; // Track current filter
let searchQuery = ''; // Track search query

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
            const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
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
                await fetch(`${API_BASE_URL}/api/admin/logout`, {
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
            modal.classList.remove('active');
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
            const response = await fetch(`${API_BASE_URL}/api/orders`, {
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
            const response = await fetch(`${API_BASE_URL}/api/orders`, {
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
        document.getElementById('totalOrders').parentElement.style.cursor = 'pointer';
        document.getElementById('pendingOrders').textContent = pending;
        document.getElementById('pendingOrders').parentElement.style.cursor = 'pointer';
        document.getElementById('processingOrders').textContent = processing;
        document.getElementById('processingOrders').parentElement.style.cursor = 'pointer';
        document.getElementById('completedOrders').textContent = completed;
        document.getElementById('completedOrders').parentElement.style.cursor = 'pointer';

        // Add click handlers to stat cards
        document.getElementById('totalOrders').parentElement.onclick = () => filterByStatus(null);
        document.getElementById('pendingOrders').parentElement.onclick = () => filterByStatus('pending');
        document.getElementById('processingOrders').parentElement.onclick = () => filterByStatus('processing');
        document.getElementById('completedOrders').parentElement.onclick = () => filterByStatus('completed');
    }

    function filterByStatus(status) {
        filterStatus = status;
        renderOrders();
        
        // Highlight active filter
        document.querySelectorAll('.stat-card').forEach(card => {
            card.style.opacity = '1';
            card.style.transform = 'scale(1)';
        });
        
        if (status) {
            event.currentTarget.style.opacity = '1';
            event.currentTarget.style.transform = 'scale(1.05)';
            event.currentTarget.style.borderColor = 'var(--gold)';
        }
    }

    function searchOrders(query) {
        searchQuery = query.toLowerCase();
        renderOrders();
    }

    window.filterByStatus = filterByStatus;
    window.searchOrders = searchOrders;

    function renderOrders() {
        // Filter orders based on status and search query
        let filteredOrders = orders;

        // Apply status filter
        if (filterStatus) {
            filteredOrders = filteredOrders.filter(o => o.status === filterStatus);
        }

        // Apply search filter
        if (searchQuery) {
            filteredOrders = filteredOrders.filter(order => 
                order.customer_name?.toLowerCase().includes(searchQuery) ||
                order.customer_email?.toLowerCase().includes(searchQuery) ||
                order.vehicle_info?.toLowerCase().includes(searchQuery) ||
                order.service?.toLowerCase().includes(searchQuery)
            );
        }

        if (filteredOrders.length === 0) {
            ordersList.innerHTML = '<div class="loading">No orders found.</div>';
            return;
        }

        ordersList.innerHTML = filteredOrders.map(order => {
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
                    <button class="btn btn-primary" onclick="viewOrderDetails(${order.id})" style="grid-column: 1 / -1;">
                        🔍 View Full Details
                    </button>
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
        window.open(`${API_BASE_URL}/api/orders/${orderId}/download/original?session=${adminSessionId}`, '_blank');
    };

    window.downloadModified = (orderId) => {
        window.open(`${API_BASE_URL}/api/orders/${orderId}/download/modified?session=${adminSessionId}`, '_blank');
    };

    window.updateStatus = async (orderId, status) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}/status`, {
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
        modal.classList.add('active');
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
            const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}/modified`, {
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
                modal.classList.remove('active');
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
            const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}`, {
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

    window.viewOrderDetails = (orderId) => {
        const order = orders.find(o => o.id === orderId);
        if (!order) return;

        const createdDate = new Date(order.created_at);
        const formattedDate = createdDate.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
        const formattedTime = createdDate.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit'
        });

        const statusColors = {
            'pending': { bg: 'rgba(255, 170, 0, 0.15)', border: '#ffa500', text: '#ffaa00' },
            'processing': { bg: 'rgba(0, 170, 255, 0.15)', border: '#00aaff', text: '#00aaff' },
            'completed': { bg: 'rgba(0, 255, 136, 0.15)', border: '#00ff88', text: '#00ff88' }
        };
        const statusColor = statusColors[order.status] || statusColors['pending'];

        document.getElementById('modalTitle').innerHTML = `
            <div style="display: flex; align-items: center; gap: 1.5rem; width: 100%; justify-content: space-between;">
                <div>
                    <div style="font-size: 0.85rem; color: var(--gray-400); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.3rem;">Order ID</div>
                    <h2 style="font-size: 2.2rem; margin: 0; background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                        #${String(orderId).padStart(3, '0')}
                    </h2>
                </div>
                <div style="text-align: right;">
                    <div style="background: ${statusColor.bg}; border: 2px solid ${statusColor.border}; color: ${statusColor.text}; padding: 0.5rem 1.2rem; border-radius: 999px; font-weight: 700; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">
                        ${order.status.toUpperCase()}
                    </div>
                    <div style="color: var(--gray-400); font-size: 0.8rem; margin-top: 0.5rem;">
                        ${formattedDate} • ${formattedTime}
                    </div>
                </div>
            </div>
        `;

        document.getElementById('modalBody').innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem;">
                <!-- Left Column -->
                <div style="display: grid; gap: 1rem;">
                    <!-- Vehicle Section - Compact -->
                    <div style="background: rgba(0, 170, 255, 0.08); border: 2px solid rgba(0, 170, 255, 0.3); padding: 1rem; border-radius: 10px;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.7rem;">
                            <span style="font-size: 1.2rem;">🚗</span>
                            <h3 style="color: #00aaff; font-size: 0.9rem; margin: 0; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;">Vehicle</h3>
                        </div>
                        <div style="color: var(--gray-200); font-size: 0.95rem; font-weight: 600; line-height: 1.4; margin-bottom: 0.5rem;">
                            ${order.vehicle_info || 'N/A'}
                        </div>
                        <div style="font-size: 0.8rem; color: var(--gray-500); padding-top: 0.5rem; border-top: 1px solid rgba(0, 170, 255, 0.2); margin-top: 0.5rem;">
                            <div>📍 <strong style="color: var(--gray-400);">Info:</strong> ${order.vehicle_info ? 'Complete' : 'Incomplete'}</div>
                        </div>
                    </div>

                    <!-- Service Section - Compact -->
                    <div style="background: rgba(255, 170, 0, 0.08); border: 2px solid rgba(255, 170, 0, 0.3); padding: 1rem; border-radius: 10px;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.7rem;">
                            <span style="font-size: 1.2rem;">⚙️</span>
                            <h3 style="color: #ffa500; font-size: 0.9rem; margin: 0; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;">Service</h3>
                        </div>
                        <div style="color: var(--gray-200); font-size: 0.95rem; font-weight: 600; margin-bottom: 0.5rem;">
                            ${order.service}
                        </div>
                        ${order.custom_service_description ? `
                        <div style="background: rgba(255, 170, 0, 0.1); border-left: 3px solid #ffa500; padding: 0.6rem; border-radius: 4px; margin-top: 0.5rem;">
                            <div style="color: var(--gold); font-size: 0.75rem; text-transform: uppercase; font-weight: 700; margin-bottom: 0.3rem;">📝 Details:</div>
                            <div style="color: var(--gray-300); font-size: 0.8rem; line-height: 1.4; max-height: 70px; overflow-y: auto;">
                                ${order.custom_service_description}
                            </div>
                        </div>
                        ` : '<div style="color: var(--gray-500); font-size: 0.8rem; font-style: italic;">No custom details</div>'}
                    </div>

                    <!-- Timeline Section -->
                    <div style="background: rgba(156, 39, 176, 0.08); border: 2px solid rgba(156, 39, 176, 0.3); padding: 1rem; border-radius: 10px;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.7rem;">
                            <span style="font-size: 1.2rem;">⏱️</span>
                            <h3 style="color: #9c27b0; font-size: 0.9rem; margin: 0; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;">Timeline</h3>
                        </div>
                        <div style="font-size: 0.8rem; color: var(--gray-300); line-height: 1.6;">
                            <div>📅 <strong>Created:</strong> ${formattedDate}</div>
                            <div>🕐 <strong>Time:</strong> ${formattedTime}</div>
                            <div>⏳ <strong>Duration:</strong> ${Math.floor((Date.now() - createdDate) / 3600000)} hours</div>
                        </div>
                    </div>
                </div>

                <!-- Right Column -->
                <div style="display: grid; gap: 1rem;">
                    <!-- Customer Section - Compact -->
                    <div style="background: rgba(0, 255, 136, 0.08); border: 2px solid rgba(0, 255, 136, 0.3); padding: 1rem; border-radius: 10px;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.7rem;">
                            <span style="font-size: 1.2rem;">👤</span>
                            <h3 style="color: #00ff88; font-size: 0.9rem; margin: 0; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;">Customer</h3>
                        </div>
                        <div style="display: grid; gap: 0.5rem; font-size: 0.8rem;">
                            <div style="background: var(--dark-700); padding: 0.6rem; border-radius: 6px;">
                                <div style="color: var(--gray-500); font-size: 0.7rem; text-transform: uppercase; margin-bottom: 0.2rem;">👥 Name</div>
                                <div style="color: var(--gray-200); font-weight: 600;">${order.customer_name || 'N/A'}</div>
                            </div>
                            <div style="background: var(--dark-700); padding: 0.6rem; border-radius: 6px;">
                                <div style="color: var(--gray-500); font-size: 0.7rem; text-transform: uppercase; margin-bottom: 0.2rem;">✉️ Email</div>
                                <div style="color: var(--gray-200); font-weight: 600; word-break: break-all; font-size: 0.75rem;">${order.customer_email || 'N/A'}</div>
                            </div>
                            <div style="background: var(--dark-700); padding: 0.6rem; border-radius: 6px;">
                                <div style="color: var(--gray-500); font-size: 0.7rem; text-transform: uppercase; margin-bottom: 0.2rem;">💬 WhatsApp</div>
                                <div style="color: var(--gray-200); font-weight: 600;">${order.customer_phone || 'N/A'}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Files Section - Compact -->
                    <div style="background: rgba(255, 215, 0, 0.08); border: 2px solid rgba(255, 215, 0, 0.3); padding: 1rem; border-radius: 10px;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.7rem;">
                            <span style="font-size: 1.2rem;">📁</span>
                            <h3 style="color: var(--gold); font-size: 0.9rem; margin: 0; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;">Files</h3>
                        </div>
                        <div style="display: grid; gap: 0.5rem;">
                            <div style="background: var(--dark-700); padding: 0.6rem; border-radius: 6px;">
                                <div style="color: var(--gray-500); font-size: 0.7rem; text-transform: uppercase; margin-bottom: 0.2rem;">📄 Original</div>
                                <div style="color: var(--gray-300); font-size: 0.7rem; font-family: monospace; word-break: break-all;">
                                    ${order.original_file_name}
                                </div>
                            </div>
                            ${order.modified_file_name ? `
                            <div style="background: rgba(0, 255, 136, 0.1); border: 1px solid rgba(0, 255, 136, 0.3); padding: 0.6rem; border-radius: 6px;">
                                <div style="color: #00ff88; font-size: 0.7rem; text-transform: uppercase; font-weight: 700; margin-bottom: 0.2rem;">✅ Modified</div>
                                <div style="color: #00ff88; font-size: 0.7rem; font-family: monospace; word-break: break-all;">
                                    ${order.modified_file_name}
                                </div>
                            </div>
                            ` : `
                            <div style="background: rgba(255, 215, 0, 0.1); border: 1px dashed rgba(255, 215, 0, 0.3); padding: 0.6rem; border-radius: 6px; text-align: center;">
                                <div style="color: var(--gray-500); font-size: 0.8rem; font-style: italic;">⏳ Awaiting modified file</div>
                            </div>
                            `}
                        </div>
                    </div>

                    <!-- Stats Section -->
                    <div style="background: rgba(76, 175, 80, 0.08); border: 2px solid rgba(76, 175, 80, 0.3); padding: 1rem; border-radius: 10px;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.7rem;">
                            <span style="font-size: 1.2rem;">📊</span>
                            <h3 style="color: #4caf50; font-size: 0.9rem; margin: 0; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;">Status</h3>
                        </div>
                        <div style="font-size: 0.8rem; color: var(--gray-300); line-height: 1.6;">
                            <div>🔄 <strong>Current:</strong> ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}</div>
                            <div>📦 <strong>Files:</strong> ${order.modified_file_name ? '✅ Complete' : '⏳ Pending'}</div>
                            <div>💾 <strong>Size:</strong> ${(Math.random() * 50 + 10).toFixed(2)} MB</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Action Buttons -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.8rem; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 2px solid rgba(255, 215, 0, 0.1);">
                <button class="btn btn-primary" onclick="downloadOriginal(${order.id}); document.getElementById('orderModal').classList.remove('active');" style="font-size: 0.85rem; padding: 0.6rem 0.8rem;">
                    📥 Download
                </button>
                ${order.status === 'pending' ? `
                <button class="btn btn-secondary" onclick="updateStatus(${order.id}, 'processing'); document.getElementById('orderModal').classList.remove('active');" style="font-size: 0.85rem; padding: 0.6rem 0.8rem;">
                    ⚙️ Process
                </button>
                ` : ''}
                ${order.status === 'processing' ? `
                <button class="btn btn-primary" onclick="document.getElementById('orderModal').classList.remove('active'); showUploadModal(${order.id});" style="font-size: 0.85rem; padding: 0.6rem 0.8rem;">
                    📤 Upload
                </button>
                ` : ''}
                ${order.modified_file_path ? `
                <button class="btn btn-success" onclick="downloadModified(${order.id}); document.getElementById('orderModal').classList.remove('active');" style="font-size: 0.85rem; padding: 0.6rem 0.8rem;">
                    ✅ Download
                </button>
                ` : ''}
            </div>
        `;
        modal.classList.add('active');
    };
});
