// File upload form handling
const API_BASE_URL = (window.API_BASE_URL || '').replace(/\/$/, '');

// POST a FormData payload via XHR so upload progress can be reported.
// Resolves with { ok, status, data } like fetch() would.
function uploadWithProgress(url, formData, headers, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        Object.keys(headers || {}).forEach(key => xhr.setRequestHeader(key, headers[key]));
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && typeof onProgress === 'function') {
                onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
            }
        });
        xhr.addEventListener('load', () => {
            let data = {};
            try { data = JSON.parse(xhr.responseText || '{}'); } catch (err) { /* non-JSON response */ }
            resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
        });
        xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
        xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
        xhr.send(formData);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('uploadForm');
    const fileInput = document.getElementById('ecuFile');
    const fileUploadButton = document.getElementById('ecuFileButton');
    const fileUploadText = fileUploadButton ? fileUploadButton.querySelector('.file-upload-text') : null;
    const fileInfo = document.getElementById('fileInfo');
    const messageDiv = document.getElementById('message');
    const submitBtn = document.getElementById('submitBtn');
    const btnLoader = document.getElementById('btnLoader');
    const btnText = submitBtn.querySelector('.btn-text');
    const serviceSelect = document.getElementById('service');
    const customServiceGroup = document.getElementById('customServiceGroup');
    const customServiceDescription = document.getElementById('customServiceDescription');
    const uploadProgress = document.getElementById('uploadProgress');
    const uploadProgressBar = document.getElementById('uploadProgressBar');

    // Show/hide custom service description based on service selection
    serviceSelect.addEventListener('change', (e) => {
        if (e.target.value === 'Autres') {
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
            if (fileUploadButton) {
                fileUploadButton.classList.add('has-file');
            }
            if (fileUploadText) {
                fileUploadText.textContent = file.name;
            }
        } else {
            fileInfo.classList.remove('show');
            if (fileUploadButton) {
                fileUploadButton.classList.remove('has-file');
            }
            if (fileUploadText) {
                fileUploadText.textContent = 'Choose ECU File';
            }
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

        // Validate custom service description if Autres is selected
        if (serviceSelect.value === 'Autres' && !customServiceDescription.value.trim()) {
            showMessage('Please provide a description for your custom service request', 'error');
            customServiceGroup.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }

        // Add custom service description to form data if provided (replace existing field)
        if (serviceSelect.value === 'Autres' && customServiceDescription.value.trim()) {
            // use set() to replace any value that FormData(form) may have captured
            formData.set('customServiceDescription', customServiceDescription.value.trim());
        }

        // Disable submit button and show progress state
        submitBtn.disabled = true;
        btnText.textContent = 'Uploading...';
        btnLoader.style.display = 'inline-block';
        messageDiv.classList.remove('show');
        uploadProgress.classList.add('show');
        uploadProgressBar.style.width = '0%';
        uploadProgress.setAttribute('aria-valuenow', '0');

        try {
            const result = await uploadWithProgress(
                `${API_BASE_URL}/api/orders`,
                formData,
                null,
                (percent) => {
                    uploadProgressBar.style.width = percent + '%';
                    uploadProgress.setAttribute('aria-valuenow', String(percent));
                }
            );

            if (result.ok) {
                showMessage(
                    `✅ Order submitted successfully! Order ID: ${result.data.orderId}. Your file is being processed.`,
                    'success'
                );
                form.reset();
                fileInfo.classList.remove('show');
                if (fileUploadButton) {
                    fileUploadButton.classList.remove('has-file');
                }
                if (fileUploadText) {
                    fileUploadText.textContent = 'Choose ECU File';
                }
            } else {
                showMessage(`❌ Error: ${result.data.error || 'Failed to submit order'}`, 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showMessage('❌ Network error. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            btnText.textContent = 'Upload & Submit Order';
            btnLoader.style.display = 'none';
            uploadProgress.classList.remove('show');
        }
    });

    function showMessage(text, type) {
        messageDiv.textContent = text;
        messageDiv.className = `message ${type} show`;
        
        // Scroll to message
        messageDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
});

// Animated stat counters for the vehicle coverage section
(function () {
    const counters = document.querySelectorAll('.stat-number[data-target]');
    if (!counters.length) return;

    const ANIMATION_DURATION = 1200;

    function animateCounter(el) {
        const target = parseInt(el.getAttribute('data-target'), 10);
        if (isNaN(target)) return;

        const startTime = performance.now();

        function frame(now) {
            const progress = Math.min((now - startTime) / ANIMATION_DURATION, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            el.textContent = Math.round(eased * target).toLocaleString();
            if (progress < 1) {
                requestAnimationFrame(frame);
            }
        }

        requestAnimationFrame(frame);
    }

    if (document.querySelector('.stat-number')) {
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries, obs) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        animateCounter(entry.target);
                        obs.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.5 });

            counters.forEach((counter) => observer.observe(counter));
        } else {
            // Fallback: run immediately if IntersectionObserver is unsupported
            counters.forEach(animateCounter);
        }
    }
})();
