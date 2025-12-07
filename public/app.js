// File upload form handling
const API_BASE_URL = (window.API_BASE_URL || '').replace(/\/$/, '');

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('uploadForm');
    const fileInput = document.getElementById('ecuFile');
    const fileInfo = document.getElementById('fileInfo');
    const messageDiv = document.getElementById('message');
    const submitBtn = document.getElementById('submitBtn');
    const btnLoader = document.getElementById('btnLoader');
    const btnText = submitBtn.querySelector('.btn-text');
    const serviceSelect = document.getElementById('service');
    const customServiceGroup = document.getElementById('customServiceGroup');
    const customServiceDescription = document.getElementById('customServiceDescription');

    // Show/hide custom service description based on service selection
    serviceSelect.addEventListener('change', (e) => {
        if (e.target.value === 'Custom') {
            customServiceGroup.style.display = 'block';
            customServiceDescription.setAttribute('required', 'required');
        } else {
            customServiceGroup.style.display = 'none';
            customServiceDescription.removeAttribute('required');
            customServiceDescription.value = '';
        }
    });

    // Show file info when file is selected
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const fileSize = (file.size / 1024 / 1024).toFixed(2);
            fileInfo.textContent = `Selected: ${file.name} (${fileSize} MB)`;
            fileInfo.classList.add('show');
        } else {
            fileInfo.classList.remove('show');
        }
    });

    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(form);
        
        // Validate file
        if (!fileInput.files[0]) {
            showMessage('Please select a file to upload', 'error');
            return;
        }

        // Validate custom service description if Custom is selected
        if (serviceSelect.value === 'Custom' && !customServiceDescription.value.trim()) {
            showMessage('Please provide a description for your custom service request', 'error');
            customServiceGroup.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }

        // Add custom service description to form data if provided (replace existing field)
        if (serviceSelect.value === 'Custom' && customServiceDescription.value.trim()) {
            // use set() to replace any value that FormData(form) may have captured
            formData.set('customServiceDescription', customServiceDescription.value.trim());
        }

        // Disable submit button
        submitBtn.disabled = true;
        btnText.textContent = 'Uploading...';
        btnLoader.style.display = 'inline-block';
        messageDiv.classList.remove('show');

        try {
            const response = await fetch(`${API_BASE_URL}/api/orders`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                showMessage(
                    `✅ Order submitted successfully! Order ID: ${data.orderId}. Your file is being processed.`,
                    'success'
                );
                form.reset();
                fileInfo.classList.remove('show');
            } else {
                showMessage(`❌ Error: ${data.error || 'Failed to submit order'}`, 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showMessage('❌ Network error. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            btnText.textContent = 'Upload & Submit Order';
            btnLoader.style.display = 'none';
        }
    });

    function showMessage(text, type) {
        messageDiv.textContent = text;
        messageDiv.className = `message ${type} show`;
        
        // Scroll to message
        messageDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
});

