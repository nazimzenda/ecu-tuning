// File upload form handling
// config.js is served at runtime by client-server.js; guard its absence in static previews
window.API_BASE_URL = window.API_BASE_URL || '';
const API_BASE_URL = window.API_BASE_URL.replace(/\/$/, '');

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

    // Service cards preset the order form: smooth-scroll to #order, select
    // the card's service, then focus the select.
    const orderSection = document.getElementById('order');
    document.querySelectorAll('.service-card .card-link[data-service]').forEach((link) => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            if (serviceSelect && link.getAttribute('data-service')) {
                serviceSelect.value = link.getAttribute('data-service');
                serviceSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (orderSection) {
                orderSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                window.setTimeout(() => {
                    if (serviceSelect) serviceSelect.focus({ preventScroll: true });
                }, 500);
            }
        });
    });

    // Scrollspy: mark the nav link of the section on screen while scrolling.
    const navHashLinks = Array.from(document.querySelectorAll('.nav-links a[href^="#"]'));
    const navTargets = navHashLinks
        .map((link) => document.querySelector(link.getAttribute('href')))
        .filter((section) => section);
    if (navHashLinks.length && navTargets.length && 'IntersectionObserver' in window) {
        const setCurrent = (id) => {
            navHashLinks.forEach((link) => {
                if (link.getAttribute('href') === '#' + id) link.setAttribute('aria-current', 'page');
                else link.removeAttribute('aria-current');
            });
        };
        const spy = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) setCurrent(entry.target.id);
            }
        }, { rootMargin: '-35% 0px -55% 0px', threshold: 0 });
        navTargets.forEach((section) => spy.observe(section));
    }

    // Phone menu: open the full-screen menu, close it when a link is followed
    const menuToggle = document.querySelector('.menu-toggle');
    const mobileMenu = document.getElementById('mobile-menu');
    if (menuToggle && mobileMenu) {
        const setMenu = (open) => {
            mobileMenu.classList.toggle('open', open);
            menuToggle.setAttribute('aria-expanded', String(open));
        };
        menuToggle.addEventListener('click', () => setMenu(!mobileMenu.classList.contains('open')));
        mobileMenu.querySelectorAll('a[href^="#"]').forEach((link) => {
            link.addEventListener('click', () => setMenu(false));
        });
    }

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
                    `Order submitted successfully. Order ID: ${result.data.orderId}. Your file is being processed.`,
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
                showMessage(`Error: ${result.data.error || 'Failed to submit order'}`, 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showMessage('Network error. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            btnText.textContent = 'Send your ECU file';
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

