/* ============================================================
   ECU Tuning Pro — Lead Intelligence frontend
   Vanilla JS. No build step. Reuses the existing admin session.
   ============================================================ */

(() => {
    'use strict';

    const API_BASE_URL = (window.API_BASE_URL || '').replace(/\/$/, '');
    const PAGE_SIZE = 50;
    const MAX_IMPORT_ROWS = 1000;

    const state = {
        session: localStorage.getItem('adminSessionId') || null,
        config: null,
        stats: null,
        jobs: [],
        jobsInitialized: false,
        announcedJobs: new Set(),
        leads: [],
        total: 0,
        offset: 0,
        loadingLeads: false,
        filters: { q: '', country: '', potential: '', status: '', pipeline: '', compliance: '' },
        currentView: 'overview',
        map: null,
        markersLayer: null,
        mapFilter: 'all',
        mapLeads: [],
        selectedLead: null,
        pollTimer: null,
        toastTimer: null
    };

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

    /* ---------- utilities ---------- */

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function safeUrl(value) {
        if (!value) return '';
        try {
            const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
            return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
        } catch {
            return '';
        }
    }

    function safeEmail(value) {
        const email = String(value || '').trim();
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : '';
    }

    function digits(value) {
        return String(value || '').replace(/\D/g, '');
    }

    function formatNumber(value) {
        return new Intl.NumberFormat('en-US').format(Number(value) || 0);
    }

    function parseDate(value) {
        if (!value) return null;
        const raw = String(value);
        const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)
            ? raw
            : `${raw.replace(' ', 'T')}Z`;
        const date = new Date(normalized);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatDate(value, options = {}) {
        const date = parseDate(value);
        if (!date) return 'Unknown';
        return date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            ...options
        });
    }

    function formatDateTime(value) {
        const date = parseDate(value);
        if (!date) return 'Unknown';
        return date.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function timeAgo(value) {
        const date = parseDate(value);
        if (!date) return 'unknown';
        const seconds = Math.round((Date.now() - date.getTime()) / 1000);
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }

    function initials(name) {
        const parts = String(name || '?')
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .split(/\s+/)
            .filter(Boolean);
        if (!parts.length) return '?';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }

    function debounce(fn, wait = 300) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), wait);
        };
    }

    function labelForVerification(value) {
        return ({
            verified: 'Verified',
            enriched: 'Enriched',
            discovered: 'Discovered',
            needs_review: 'Needs review',
            contacted: 'Contacted',
            qualified: 'Qualified',
            rejected: 'Archived'
        })[value] || String(value || 'Unknown');
    }

    function labelForPipeline(value) {
        return ({
            new: 'New',
            reviewing: 'Reviewing',
            contacted: 'Contacted',
            qualified: 'Qualified',
            won: 'Won',
            not_fit: 'Not a fit',
            opted_out: 'Opted out'
        })[value] || String(value || 'New');
    }

    function labelForPotential(value) {
        return ({ high: 'High', medium: 'Medium', low: 'Low' })[value] || value || 'Low';
    }

    function labelForWebsiteStatus(value) {
        return ({
            ok: 'Reachable',
            unchecked: 'Not checked',
            blocked: 'Blocked by robots.txt',
            unreachable: 'Unreachable',
            directory: 'Directory only',
            'social-only': 'Social profile only',
            missing: 'No website',
            invalid: 'Invalid URL'
        })[value] || String(value || 'Not checked');
    }

    function labelForCategory(value) {
        return ({
            tuning: 'ECU tuning',
            diagnostics: 'Diagnostics',
            garage: 'Repair garage',
            parts: 'Parts / accessories',
            automotive: 'Automotive'
        })[value] || String(value || 'Automotive');
    }

    function labelForService(value) {
        return ({
            ecuSpecialist: 'ECU specialist',
            remapping: 'ECU remapping',
            diagnostics: 'Diagnostics',
            repair: 'Repair',
            emissionsRepair: 'Emissions repair',
            b2bFileService: 'File service / B2B'
        })[value] || value;
    }

    function badge(value, text, extraClass = '') {
        return `<span class="badge ${escapeHtml(value)} ${extraClass}">${escapeHtml(text)}</span>`;
    }

    function potentialBadge(value) {
        return badge(value, labelForPotential(value));
    }

    function verificationBadge(value) {
        return badge(value, labelForVerification(value));
    }

    function pipelineBadge(value) {
        return badge(value, labelForPipeline(value), 'pipeline');
    }

    function toast(message, type = 'ok') {
        const el = $('#toast');
        if (!el) return;
        el.textContent = message;
        el.className = `toast show${type === 'error' ? ' error' : ''}`;
        clearTimeout(state.toastTimer);
        state.toastTimer = setTimeout(() => {
            el.className = 'toast';
        }, 3800);
    }

    /* ---------- API ---------- */

    async function api(path, options = {}) {
        const headers = { ...(options.headers || {}) };
        if (state.session) headers['x-admin-session'] = state.session;
        let body = options.body;
        if (body && typeof body === 'object' && !(body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(body);
        }

        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            headers,
            body
        });

        if (response.status === 401) {
            state.session = null;
            localStorage.removeItem('adminSessionId');
            showLogin('Your admin session expired. Sign in again.');
            throw new Error('Session expired');
        }

        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
            ? await response.json().catch(() => ({}))
            : await response.text().catch(() => '');

        if (!response.ok) {
            const message = payload && typeof payload === 'object' ? payload.error : payload;
            throw new Error(message || `Request failed (${response.status})`);
        }
        return payload;
    }

    /* ---------- auth / shell ---------- */

    function showLogin(message = '') {
        $('#loginView').hidden = false;
        $('#appView').hidden = true;
        clearTimeout(state.pollTimer);
        state.pollTimer = null;
        const messageEl = $('#loginMessage');
        if (messageEl) {
            messageEl.textContent = message;
            messageEl.className = 'form-message';
        }
        document.body.style.overflow = '';
    }

    function showApp() {
        $('#loginView').hidden = true;
        $('#appView').hidden = false;
        document.body.style.overflow = '';
    }

    async function login(password) {
        const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success || !payload.sessionId) {
            throw new Error(payload.error || 'Invalid password');
        }
        state.session = payload.sessionId;
        localStorage.setItem('adminSessionId', state.session);
        showApp();
        try {
            await loadWorkspace();
        } catch (error) {
            showLogin(error.message || 'Could not load the lead workspace.');
            throw error;
        }
    }

    async function logout() {
        try {
            if (state.session) {
                await fetch(`${API_BASE_URL}/api/admin/logout`, {
                    method: 'POST',
                    headers: { 'x-admin-session': state.session }
                });
            }
        } catch {
            // Local logout still proceeds.
        }
        state.session = null;
        localStorage.removeItem('adminSessionId');
        clearTimeout(state.pollTimer);
        state.pollTimer = null;
        showLogin();
    }

    async function checkSession() {
        if (!state.session) {
            showLogin();
            return false;
        }
        try {
            await loadConfig();
            await loadStats();
            return true;
        } catch (error) {
            if (error.message !== 'Session expired') {
                showLogin('Cannot reach the lead research API.');
            }
            return false;
        }
    }

    /* ---------- workspace boot ---------- */

    async function loadWorkspace() {
        state.jobsInitialized = false;
        await Promise.all([loadConfig(), loadStats()]);
        await Promise.allSettled([loadJobs(), loadMap(), loadTopLeads()]);

        const requested = (location.hash || '').replace('#', '');
        if (['leads', 'runs', 'sources'].includes(requested)) {
            switchView(requested, false);
        } else {
            renderFocus();
        }
    }

    function switchView(view, updateHash = true) {
        const allowed = ['overview', 'leads', 'runs', 'sources'];
        if (!allowed.includes(view)) view = 'overview';
        state.currentView = view;

        $$('.nav-item[data-view]').forEach((button) => {
            button.classList.toggle('active', button.dataset.view === view);
        });
        $$('[data-view-panel]').forEach((panel) => {
            panel.hidden = panel.dataset.viewPanel !== view;
        });

        if (updateHash) {
            history.replaceState(null, '', `#${view}`);
        }

        if (view === 'overview') {
            setTimeout(() => {
                if (state.map) state.map.invalidateSize();
            }, 80);
            loadStats().catch(() => {});
            loadMap().catch(() => {});
            loadTopLeads().catch(() => {});
        } else if (view === 'leads') {
            loadLeads(true).catch(() => {});
        } else if (view === 'runs') {
            loadJobs().catch(() => {});
        } else if (view === 'sources') {
            renderSources();
        }
    }

    /* ---------- config / filters / focus ---------- */

    async function loadConfig() {
        if (state.config) return state.config;
        state.config = await api('/api/leads/config');
        renderCountryChecks();
        renderFilterCountries();
        renderRollout();
        return state.config;
    }

    function renderCountryChecks() {
        const container = $('#countryChecks');
        const more = $('#countryChecksMore');
        const toggle = $('#toggleAllCountries');
        if (!container || !state.config) return;
        const countries = [...state.config.countries].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
        const defaultChecked = new Set(['FR', 'DE', 'GB']);
        const primary = countries.filter((country) => Number(country.priority) <= 6);
        const rest = countries.filter((country) => Number(country.priority) > 6);
        const render = (country) => `
            <label class="country-check">
                <input type="checkbox" value="${escapeHtml(country.code)}" data-priority="${Number(country.priority) || 9}" ${defaultChecked.has(country.code) ? 'checked' : ''}>
                <span>${escapeHtml(country.name)}</span>
                <small>${escapeHtml(country.code)}</small>
            </label>
        `;
        container.innerHTML = primary.map(render).join('');
        if (more) {
            more.innerHTML = rest.map(render).join('');
            more.hidden = true;
        }
        if (toggle) {
            toggle.textContent = rest.length ? `Show all ${rest.length} more countries` : '';
            toggle.hidden = !rest.length;
        }
    }

    function renderFilterCountries() {
        const select = $('#filterCountry');
        if (!select) return;
        const current = select.value;
        const map = new Map();

        if (state.config) {
            for (const country of state.config.countries) {
                map.set(country.code, {
                    code: country.code,
                    name: country.name,
                    priority: country.priority,
                    count: 0
                });
            }
        }
        if (state.stats?.by_country) {
            for (const row of state.stats.by_country) {
                const code = row.country_code || '';
                if (!code) continue;
                if (!map.has(code)) {
                    map.set(code, {
                        code,
                        name: row.country || code,
                        priority: 99,
                        count: row.total || 0
                    });
                } else {
                    map.get(code).count = row.total || 0;
                }
            }
        }

        const entries = Array.from(map.values()).sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            if (b.count !== a.count) return b.count - a.count;
            return a.name.localeCompare(b.name);
        });

        select.innerHTML = `<option value="">All countries</option>${entries.map((entry) => {
            const suffix = entry.count ? ` (${entry.count})` : '';
            return `<option value="${escapeHtml(entry.code)}">${escapeHtml(entry.name)}${suffix}</option>`;
        }).join('')}`;
        select.value = current && map.has(current) ? current : '';
    }

    function renderFocus() {
        const container = $('#focusList');
        if (!container || !state.config) return;
        const counts = new Map((state.stats?.by_country || []).map((row) => [row.country_code, row]));
        const focus = state.config.countries
            .filter((country) => country.priority <= 6)
            .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
            .slice(0, 9);
        const max = Math.max(1, ...focus.map((country) => counts.get(country.code)?.total || 0));

        container.innerHTML = focus.map((country) => {
            const row = counts.get(country.code);
            const total = row?.total || 0;
            const width = Math.round((total / max) * 100);
            return `
                <div class="focus-row">
                    <span class="focus-code">${escapeHtml(country.code)}</span>
                    <span class="focus-name">${escapeHtml(country.name)}</span>
                    <span class="focus-count">${formatNumber(total)}</span>
                    <div class="focus-bar"><span style="width:${Math.max(total ? 4 : 0, width)}%"></span></div>
                </div>
            `;
        }).join('');
    }

    function renderRollout() {
        const container = $('#rolloutList');
        if (!container || !state.config) return;
        const countries = state.config.countries
            .filter((country) => country.priority <= 6)
            .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
        container.innerHTML = countries.map((country) => `
            <div class="rollout-item">
                <span class="priority">${Number(country.priority) || '·'}</span>
                <div>
                    <strong>${escapeHtml(country.name)}</strong>
                    <span>${formatNumber(country.cities.length)} priority cities</span>
                </div>
            </div>
        `).join('');
    }

    /* ---------- stats / overview ---------- */

    async function loadStats() {
        state.stats = await api('/api/leads/stats');
        renderStats();
        renderFocus();
        renderCountryBars();
        renderFilterCountries();
    }

    function renderStats() {
        const totals = state.stats?.totals || {};
        const total = Number(totals.total) || 0;
        $('#statDiscovered').textContent = formatNumber(total);
        $('#statVerified').textContent = formatNumber(totals.verified);
        $('#statHigh').textContent = formatNumber(totals.high);
        $('#statCountries').textContent = formatNumber(totals.countries);
        $('#navLeadsCount').textContent = formatNumber(total);
        $('#navRunsCount').textContent = formatNumber(state.stats?.active_jobs || 0);

        $('#statDiscoveredFoot').textContent = total
            ? `${formatNumber(totals.with_email)} with public email · ${formatNumber(totals.with_whatsapp)} with WhatsApp`
            : 'No research run yet';
        $('#statVerifiedFoot').textContent = totals.needs_review
            ? `${formatNumber(totals.needs_review)} need compliance review`
            : 'Location + official contact';
        $('#statHighFoot').textContent = total
            ? `${formatNumber(totals.medium)} medium · ${formatNumber(totals.low)} low`
            : 'Remap / file-service signals';
        $('#statCountriesFoot').textContent = totals.last_updated
            ? `Updated ${timeAgo(totals.last_updated)}`
            : 'Map coordinates on file';
    }

    function renderCountryBars() {
        const container = $('#countryBars');
        if (!container) return;
        const rows = (state.stats?.by_country || [])
            .filter((row) => Number(row.total) > 0)
            .slice(0, 8);
        if (!rows.length) {
            container.innerHTML = `<div class="empty-state" style="padding:26px 0;"><span>No country coverage yet. Run a research pass.</span></div>`;
            return;
        }
        const max = Math.max(...rows.map((row) => Number(row.total) || 0), 1);
        container.innerHTML = rows.map((row) => {
            const total = Number(row.total) || 0;
            const width = Math.max(3, Math.round((total / max) * 100));
            return `
                <div class="country-row">
                    <span class="country-code">${escapeHtml(row.country_code || '—')}</span>
                    <div class="country-main">
                        <div class="country-top">
                            <strong>${escapeHtml(row.country || row.country_code || 'Unknown')}</strong>
                            <span>${formatNumber(row.verified)} verified</span>
                        </div>
                        <div class="country-track"><span style="width:${width}%"></span></div>
                    </div>
                    <span class="country-total">${formatNumber(total)}</span>
                </div>
            `;
        }).join('');
    }

    async function loadTopLeads() {
        const container = $('#topLeads');
        if (!container) return;
        let data = await api('/api/leads?limit=5&sort=score&potential=high');
        if (!data.leads.length) {
            data = await api('/api/leads?limit=5&sort=score');
        }
        if (!data.leads.length) {
            container.innerHTML = `
                <div class="empty-state" style="padding:30px 18px;">
                    <div class="empty-icon">◎</div>
                    <strong>No opportunities yet</strong>
                    <span>Run a research pass to populate the priority queue.</span>
                    <button type="button" class="btn primary sm" data-open-research>Run research</button>
                </div>
            `;
            return;
        }
        container.innerHTML = data.leads.map((lead, index) => `
            <div class="top-lead" data-lead-id="${Number(lead.id)}" role="button" tabindex="0">
                <span class="rank">${String(index + 1).padStart(2, '0')}</span>
                <div class="top-lead-main">
                    <span class="top-lead-name">${escapeHtml(lead.name)}</span>
                    <div class="top-lead-meta">
                        <span>${escapeHtml([lead.city, lead.country_code].filter(Boolean).join(', ') || 'Location pending')}</span>
                        <span>${escapeHtml(labelForCategory(lead.category))}</span>
                        ${lead.compliance_status === 'review' ? '<span style="color:var(--warning)">Review flag</span>' : ''}
                    </div>
                </div>
                <div class="top-lead-score">
                    <strong>${Number(lead.score) || 0}</strong>
                    <span>${escapeHtml(labelForPotential(lead.potential))}</span>
                </div>
            </div>
        `).join('');
    }

    /* ---------- map ---------- */

    function initMap() {
        if (state.map || !window.L) return;
        const element = $('#leadMap');
        if (!element) return;

        state.map = L.map('leadMap', {
            zoomControl: false,
            minZoom: 2,
            maxZoom: 13,
            worldCopyJump: true,
            attributionControl: true
        }).setView([26, 8], 2);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd',
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
        }).addTo(state.map);

        L.control.zoom({ position: 'bottomright' }).addTo(state.map);
        state.markersLayer = L.layerGroup().addTo(state.map);
    }

    async function loadMap() {
        const query = state.mapFilter === 'high'
            ? '?potential=high'
            : state.mapFilter === 'verified'
                ? '?verified=1'
                : '';
        const data = await api(`/api/leads/map${query}`);
        state.mapLeads = data.leads || [];
        renderMap();
    }

    function renderMap() {
        const empty = $('#mapEmpty');
        const foot = $('#mapFootText');
        if (!empty || !foot) return;

        if (!window.L) {
            empty.hidden = false;
            empty.querySelector('strong').textContent = 'Map library unavailable';
            empty.querySelector('span').textContent = 'The lead database still works. Check the network connection to load the map.';
            foot.textContent = 'Map tiles are optional; lead records remain available.';
            return;
        }

        initMap();
        if (!state.map || !state.markersLayer) return;
        state.markersLayer.clearLayers();

        if (!state.mapLeads.length) {
            empty.hidden = false;
            empty.querySelector('strong').textContent = 'No mapped leads yet';
            empty.querySelector('span').textContent = 'Run a research pass to place verified businesses on the map.';
            state.map.setView([26, 8], 2, { animate: false });
            foot.textContent = 'Coordinates come from OpenStreetMap or official structured data.';
            return;
        }

        empty.hidden = true;
        const bounds = [];
        for (const lead of state.mapLeads) {
            const lat = Number(lead.latitude);
            const lon = Number(lead.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
            bounds.push([lat, lon]);

            const color = lead.potential === 'high'
                ? '#FFD700'
                : lead.potential === 'medium'
                    ? '#6DC8FF'
                    : '#7E8794';
            const verified = lead.verification_status === 'verified' && !lead.opt_out;
            const marker = L.circleMarker([lat, lon], {
                radius: 4 + Math.min(5, Math.round((Number(lead.score) || 0) / 22)),
                color: verified ? '#62E6AB' : color,
                weight: verified ? 2 : 1,
                fillColor: color,
                fillOpacity: 0.72
            });

            const popup = `
                <div class="map-popup">
                    <strong>${escapeHtml(lead.name)}</strong>
                    <span>${escapeHtml([lead.city, lead.country].filter(Boolean).join(', ') || 'Location')}</span>
                    <span>${escapeHtml(labelForPotential(lead.potential))} potential · score ${Number(lead.score) || 0}${verified ? ' · verified' : ''}</span>
                    <a href="#" data-open-lead="${Number(lead.id)}">Open lead →</a>
                </div>
            `;
            marker.bindPopup(popup, { closeButton: false, offset: [0, -2] });
            marker.on('popupopen', (event) => {
                const link = event.popup.getElement()?.querySelector('[data-open-lead]');
                if (link) {
                    link.addEventListener('click', (clickEvent) => {
                        clickEvent.preventDefault();
                        openLead(Number(lead.id));
                    });
                }
            });
            state.markersLayer.addLayer(marker);
        }

        if (bounds.length === 1) {
            state.map.setView(bounds[0], 7, { animate: false });
        } else if (bounds.length > 1) {
            state.map.fitBounds(bounds, { padding: [34, 34], maxZoom: 5, animate: false });
        }
        setTimeout(() => state.map.invalidateSize(), 50);
        foot.textContent = `${formatNumber(state.mapLeads.length)} mapped lead${state.mapLeads.length === 1 ? '' : 's'} · coordinates evidence-linked to the source.`;
    }

    /* ---------- lead list ---------- */

    function currentFilterQuery(extra = {}) {
        const params = new URLSearchParams();
        Object.entries(state.filters).forEach(([key, value]) => {
            if (value) params.set(key, value);
        });
        Object.entries(extra).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') params.set(key, value);
        });
        return params.toString();
    }

    async function loadLeads(reset = true) {
        if (!state.session || state.loadingLeads) return;
        state.loadingLeads = true;
        const offset = reset ? 0 : state.offset;
        try {
            const query = currentFilterQuery({ limit: PAGE_SIZE, offset, sort: 'score' });
            const data = await api(`/api/leads?${query}`);
            state.total = data.total || 0;
            state.leads = reset ? (data.leads || []) : [...state.leads, ...(data.leads || [])];
            state.offset = offset + (data.leads || []).length;
            renderLeads();
        } finally {
            state.loadingLeads = false;
        }
    }

    function renderLeads() {
        const body = $('#leadsBody');
        const empty = $('#leadsEmpty');
        const countLabel = $('#leadCountLabel');
        const loadLabel = $('#leadLoadLabel');
        const loadMore = $('#loadMoreBtn');
        if (!body || !empty) return;

        const activeFilters = Object.values(state.filters).filter(Boolean).length;
        countLabel.innerHTML = state.total
            ? `<strong>${formatNumber(state.leads.length)}</strong> of ${formatNumber(state.total)} leads`
            : 'No leads';
        loadLabel.textContent = activeFilters
            ? `${activeFilters} filter${activeFilters === 1 ? '' : 's'} active`
            : 'Sorted by fit score, then confidence';

        if (!state.leads.length) {
            body.innerHTML = '';
            empty.hidden = false;
            loadMore.hidden = true;
            return;
        }

        empty.hidden = true;
        body.innerHTML = state.leads.map((lead) => {
            const email = safeEmail(lead.email);
            const phone = String(lead.phone || '');
            const whatsapp = digits(lead.whatsapp);
            const evidence = safeUrl(lead.evidence_url || lead.source_url);
            const website = safeUrl(lead.website);
            const contact = [
                email ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : '',
                phone ? `<a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ''))}">${escapeHtml(phone)}</a>` : '',
                whatsapp ? `<a href="https://wa.me/${escapeHtml(whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>` : ''
            ].filter(Boolean).join('') || '<span>No public contact yet</span>';

            return `
                <tr data-lead-id="${Number(lead.id)}" tabindex="0">
                    <td>
                        <div class="lead-name">
                            <span class="lead-avatar">${escapeHtml(initials(lead.name))}</span>
                            <div class="lead-name-text">
                                <strong>${escapeHtml(lead.name)}</strong>
                                <span>${escapeHtml(labelForCategory(lead.category))} · ${escapeHtml(lead.source || 'source')}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="lead-location">
                            ${escapeHtml([lead.city, lead.country_code].filter(Boolean).join(', ') || 'Not recorded')}
                            <small>${escapeHtml(lead.geo_precision === 'rooftop' ? 'street-level coordinates' : lead.geo_precision || 'no coordinates')}</small>
                        </div>
                    </td>
                    <td>
                        <div class="contact-stack">
                            ${contact}
                            ${website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener">${escapeHtml(lead.domain || 'Website')}</a>` : ''}
                        </div>
                    </td>
                    <td>
                        ${potentialBadge(lead.potential)}
                        <div class="lead-score">Score ${Number(lead.score) || 0} · confidence ${Number(lead.confidence) || 0}</div>
                        ${lead.compliance_status === 'review' ? '<div style="margin-top:5px;">' + badge('needs_review', 'Review flag') + '</div>' : ''}
                    </td>
                    <td>
                        ${verificationBadge(lead.verification_status)}
                        ${lead.pipeline_status && lead.pipeline_status !== 'new' ? `<div style="margin-top:5px;">${pipelineBadge(lead.pipeline_status)}</div>` : ''}
                    </td>
                    <td>
                        ${evidence ? `<a class="evidence-link" href="${escapeHtml(evidence)}" target="_blank" rel="noopener">Evidence ↗</a>` : '<span class="evidence-link">No link</span>'}
                        <div class="lead-score">${escapeHtml(lead.source || '')}</div>
                    </td>
                </tr>
            `;
        }).join('');

        loadMore.hidden = state.leads.length >= state.total;
    }

    /* ---------- drawer ---------- */

    async function openLead(id) {
        const drawer = $('#leadDrawer');
        const backdrop = $('#drawerBackdrop');
        if (!drawer || !backdrop) return;

        drawer.classList.add('open');
        drawer.setAttribute('aria-hidden', 'false');
        backdrop.hidden = false;
        document.body.style.overflow = 'hidden';
        $('#drawerKicker').textContent = 'LEAD';
        $('#drawerName').textContent = 'Loading…';
        $('#drawerBody').innerHTML = '<div class="skeleton-line"></div><div class="skeleton-line short" style="margin-top:12px;"></div>';

        try {
            const lead = await api(`/api/leads/${Number(id)}`);
            state.selectedLead = lead;
            renderDrawer(lead);
        } catch (error) {
            $('#drawerName').textContent = 'Could not load lead';
            $('#drawerBody').innerHTML = `<div class="form-message">${escapeHtml(error.message)}</div>`;
        }
    }

    function closeDrawer() {
        const drawer = $('#leadDrawer');
        const backdrop = $('#drawerBackdrop');
        if (!drawer || !backdrop) return;
        drawer.classList.remove('open');
        drawer.setAttribute('aria-hidden', 'true');
        backdrop.hidden = true;
        document.body.style.overflow = '';
        state.selectedLead = null;
    }

    function renderDrawer(lead) {
        const drawer = $('#leadDrawer');
        if (!drawer) return;
        const scoring = lead.raw_data?.scoring || {};
        const parts = scoring.parts || {};
        const reasons = scoring.reasons || [];
        const services = Array.isArray(lead.services) ? lead.services : [];
        const flags = Array.isArray(lead.compliance_flags) ? lead.compliance_flags : [];
        const website = safeUrl(lead.website);
        const evidence = safeUrl(lead.evidence_url);
        const sourceUrl = safeUrl(lead.source_url);
        const email = safeEmail(lead.email);
        const phone = String(lead.phone || '');
        const whatsapp = digits(lead.whatsapp);
        const address = [lead.address, lead.city, lead.region, lead.postal_code, lead.country]
            .filter(Boolean)
            .join(', ');

        $('#drawerKicker').textContent = `${labelForCategory(lead.category)} · ${lead.country_code || '—'}`;
        $('#drawerName').textContent = lead.name;

        const confidenceParts = [
            ['Location', Number(parts.location) || 0, 35],
            ['Contact', Number(parts.contact) || 0, 25],
            ['Website', Number(parts.website) || 0, 12],
            ['Relevance', Number(parts.relevance) || 0, 10]
        ];

        const contactCells = [
            ['Email', email ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : 'Not published', Boolean(email)],
            ['Phone', phone ? `<a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ''))}">${escapeHtml(phone)}</a>` : 'Not published', Boolean(phone)],
            ['WhatsApp', whatsapp ? `<a href="https://wa.me/${escapeHtml(whatsapp)}" target="_blank" rel="noopener">${escapeHtml(lead.whatsapp)}</a>` : 'Not published', Boolean(whatsapp)],
            ['Website', website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener">${escapeHtml(lead.domain || 'Official site')}</a>` : 'Not published', Boolean(website)]
        ];

        const socialCells = [
            ['Instagram', lead.instagram],
            ['Facebook', lead.facebook],
            ['LinkedIn', lead.linkedin]
        ].filter(([, value]) => value);

        drawer.innerHTML = `
            <div class="drawer-head">
                <div>
                    <span class="panel-kicker" id="drawerKicker">${escapeHtml(labelForCategory(lead.category))} · ${escapeHtml(lead.country_code || '—')}</span>
                    <h2 id="drawerName">${escapeHtml(lead.name)}</h2>
                </div>
                <button type="button" class="icon-btn" id="drawerClose" aria-label="Close lead details">×</button>
            </div>
            <div class="drawer-body" id="drawerBody">
                <div class="drawer-section">
                    <div class="drawer-badges">
                        ${potentialBadge(lead.potential)}
                        ${verificationBadge(lead.verification_status)}
                        ${pipelineBadge(lead.pipeline_status || 'new')}
                        ${lead.compliance_status === 'review' ? badge('needs_review', 'Compliance review') : ''}
                    </div>
                    <div class="drawer-sub">${escapeHtml(address || 'No postal address recorded')}</div>
                    <div class="drawer-actions">
                        <button type="button" class="btn primary sm" data-action="verify" ${!website ? 'disabled' : ''}>${website ? 'Verify website' : 'No website to verify'}</button>
                        ${sourceUrl || evidence ? `<a class="btn ghost sm" href="${escapeHtml(evidence || sourceUrl)}" target="_blank" rel="noopener">Open evidence ↗</a>` : ''}
                    </div>
                </div>

                ${lead.compliance_status === 'review' || lead.compliance_status === 'blocked' ? `
                    <div class="drawer-section">
                        <div class="compliance-callout">
                            <span class="icon">⚖</span>
                            <div>
                                <strong>Do not market into emissions-delete work.</strong>
                                ${flags.length ? `Public signals detected: ${escapeHtml(flags.map((flag) => typeof flag === 'string' ? flag : flag.label || flag.id).join(', '))}.` : ''}
                                Review the evidence before any outreach. Lawful calibration, diagnostics and emissions repair only.
                            </div>
                        </div>
                    </div>
                ` : ''}

                <div class="drawer-section">
                    <div class="drawer-section-title">Public contact</div>
                    <div class="contact-grid">
                        ${contactCells.map(([label, value, filled]) => `
                            <div class="contact-cell ${filled ? '' : 'empty'}">
                                <span>${escapeHtml(label)}</span>
                                ${value.startsWith('<a ') ? value : `<strong>${escapeHtml(value)}</strong>`}
                            </div>
                        `).join('')}
                    </div>
                    ${socialCells.length ? `
                        <div class="tag-list" style="margin-top:10px;">
                            ${socialCells.map(([label, value]) => {
                                const url = safeUrl(value);
                                return url ? `<a class="tag" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)} ↗</a>` : '';
                            }).join('')}
                        </div>
                    ` : ''}
                </div>

                <div class="drawer-section">
                    <div class="drawer-section-title">Fit &amp; confidence <span>${Number(lead.score) || 0}/100</span></div>
                    <div class="confidence-list">
                        ${confidenceParts.map(([label, value, max]) => `
                            <div class="confidence-row">
                                <span>${escapeHtml(label)}</span>
                                <div class="confidence-track"><span style="width:${Math.min(100, Math.round((value / max) * 100))}%"></span></div>
                                <em>${value}/${max}</em>
                            </div>
                        `).join('')}
                    </div>
                    <ul class="reason-list" style="margin-top:12px;">
                        ${reasons.length ? reasons.map((reason) => `
                            <li><b>${escapeHtml(reason.reason)}</b><em>${Number(reason.points) > 0 ? '+' : ''}${Number(reason.points) || 0}</em></li>
                        `).join('') : '<li><b>Heuristic score</b><em>—</em></li>'}
                    </ul>
                </div>

                <div class="drawer-section">
                    <div class="drawer-section-title">Service signals</div>
                    <div class="tag-list">
                        ${services.length ? services.map((service) => `<span class="tag gold">${escapeHtml(labelForService(service))}</span>`).join('') : '<span class="drawer-sub">No service signals captured yet.</span>'}
                    </div>
                    ${lead.description ? `<p class="drawer-sub" style="margin-top:10px;">${escapeHtml(lead.description)}</p>` : ''}
                </div>

                <div class="drawer-section">
                    <div class="drawer-section-title">Evidence &amp; provenance</div>
                    <div class="contact-grid">
                        <div class="contact-cell">
                            <span>Source</span>
                            <strong>${escapeHtml(lead.source || 'unknown')}</strong>
                        </div>
                        <div class="contact-cell">
                            <span>Last checked</span>
                            <strong>${escapeHtml(lead.last_verified_at ? formatDate(lead.last_verified_at) : 'Not yet verified')}</strong>
                        </div>
                        <div class="contact-cell">
                            <span>Website check</span>
                            <strong>${escapeHtml(labelForWebsiteStatus(lead.website_status))}</strong>
                        </div>
                        <div class="contact-cell">
                            <span>Pipeline</span>
                            <strong>${escapeHtml(labelForPipeline(lead.pipeline_status))}</strong>
                        </div>
                    </div>
                    <div class="tag-list" style="margin-top:10px;">
                        ${website ? `<a class="tag" href="${escapeHtml(website)}" target="_blank" rel="noopener">Website ↗</a>` : ''}
                        ${evidence ? `<a class="tag" href="${escapeHtml(evidence)}" target="_blank" rel="noopener">Evidence ↗</a>` : ''}
                        ${sourceUrl ? `<a class="tag" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">Source record ↗</a>` : ''}
                    </div>
                </div>

                <div class="drawer-section">
                    <div class="drawer-section-title">Pipeline</div>
                    <div class="drawer-actions">
                        <button type="button" class="btn ghost sm" data-pipeline="contacted">Mark contacted</button>
                        <button type="button" class="btn ghost sm" data-pipeline="qualified">Qualify</button>
                        <button type="button" class="btn ghost sm" data-pipeline="not_fit">Not a fit</button>
                        ${lead.opt_out ? '<span class="badge rejected">Opted out</span>' : `<button type="button" class="btn ghost sm" data-action="opt-out">Opt out</button>`}
                    </div>
                </div>

                <div class="drawer-section">
                    <div class="drawer-section-title">Notes</div>
                    <textarea class="notes-input" id="leadNotes" placeholder="What did you verify? Who is the right contact? What should the next human do?">${escapeHtml(lead.notes || '')}</textarea>
                    <div class="drawer-actions-row">
                        <button type="button" class="btn primary sm" data-action="save-notes">Save notes</button>
                    </div>
                </div>

                <div class="drawer-section">
                    <button type="button" class="text-btn" style="color:var(--danger)" data-action="delete">Delete this lead</button>
                </div>
            </div>
        `;

        bindDrawerActions(lead);
    }

    function bindDrawerActions(lead) {
        const drawer = $('#leadDrawer');
        if (!drawer) return;

        drawer.querySelector('#drawerClose')?.addEventListener('click', closeDrawer);
        drawer.querySelector('[data-action="verify"]')?.addEventListener('click', (event) => verifyLead(lead.id, event.currentTarget));
        drawer.querySelector('[data-action="save-notes"]')?.addEventListener('click', () => {
            const notes = drawer.querySelector('#leadNotes')?.value || '';
            patchLead(lead.id, { notes }).catch((error) => toast(error.message, 'error'));
        });
        drawer.querySelector('[data-action="opt-out"]')?.addEventListener('click', () => {
            if (!confirm('Mark this business as opted out and exclude it from exports?')) return;
            patchLead(lead.id, {
                opt_out: true,
                verification_status: 'rejected',
                pipeline_status: 'opted_out'
            }).then(closeDrawer).catch((error) => toast(error.message, 'error'));
        });
        drawer.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
            if (!confirm('Delete this lead permanently? This cannot be undone.')) return;
            api(`/api/leads/${lead.id}`, { method: 'DELETE' })
                .then(() => {
                    closeDrawer();
                    toast('Lead deleted.');
                    refreshAfterChange();
                })
                .catch((error) => toast(error.message, 'error'));
        });

        $$('[data-pipeline]', drawer).forEach((button) => {
            button.addEventListener('click', () => {
                patchLead(lead.id, { pipeline_status: button.dataset.pipeline })
                    .catch((error) => toast(error.message, 'error'));
            });
        });
    }

    async function verifyLead(id, button) {
        if (!button) return;
        const original = button.textContent;
        button.disabled = true;
        button.textContent = 'Verifying…';
        try {
            const result = await api(`/api/leads/${id}/verify`, { method: 'POST' });
            if (result.website_status === 'ok') {
                state.selectedLead = result.lead;
                renderDrawer(result.lead);
                toast('Website verified and evidence refreshed.');
            } else {
                toast('The website could not be verified. The lead was kept.', 'error');
            }
            refreshAfterChange();
        } catch (error) {
            toast(error.message, 'error');
            button.disabled = false;
            button.textContent = original;
        }
    }

    async function patchLead(id, patch) {
        const updated = await api(`/api/leads/${id}`, { method: 'PATCH', body: patch });
        state.selectedLead = updated;
        renderDrawer(updated);
        toast('Lead updated.');
        refreshAfterChange();
    }

    function refreshAfterChange() {
        loadStats().catch(() => {});
        loadMap().catch(() => {});
        loadTopLeads().catch(() => {});
        if (state.currentView === 'leads') loadLeads(true).catch(() => {});
    }

    /* ---------- research runs ---------- */

    async function loadJobs() {
        const data = await api('/api/leads/jobs?limit=12');
        const jobs = data.jobs || [];
        const completed = jobs.filter((job) => job.status === 'completed');
        if (!state.jobsInitialized) {
            completed.forEach((job) => state.announcedJobs.add(job.id));
            state.jobsInitialized = true;
        } else {
            for (const job of completed) {
                if (!state.announcedJobs.has(job.id)) {
                    state.announcedJobs.add(job.id);
                    toast(`Research run finished: ${job.added} new, ${job.updated} merged.`);
                    refreshAfterChange();
                }
            }
        }
        state.jobs = jobs;
        renderJobs();
        scheduleJobPoll();
        if (state.stats) {
            $('#navRunsCount').textContent = formatNumber(jobs.filter((job) => job.status === 'running' || job.status === 'queued').length);
        }
    }

    function scheduleJobPoll() {
        clearTimeout(state.pollTimer);
        const active = state.jobs.some((job) => job.status === 'running' || job.status === 'queued');
        if (active) {
            state.pollTimer = setTimeout(() => {
                loadJobs().catch(() => {});
            }, 2600);
        }
    }

    function renderJobs() {
        const container = $('#jobsList');
        if (!container) return;
        if (!state.jobs.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⟳</div>
                    <strong>No research runs yet</strong>
                    <span>Start with France and Germany, or enter a city you already know.</span>
                    <button type="button" class="btn primary sm" data-open-research>Start research</button>
                </div>
            `;
            return;
        }

        container.innerHTML = state.jobs.map((job) => {
            const progress = Math.max(0, Math.min(100, Number(job.progress) || 0));
            const status = job.status || 'queued';
            const logs = (job.log || []).slice(-3).reverse();
            return `
                <article class="job-card">
                    <div class="job-top">
                        <div class="job-title">
                            <strong>${escapeHtml(job.label || 'Research run')}</strong>
                            <span>${escapeHtml(formatDateTime(job.created_at))} · ${escapeHtml(job.params?.source || 'auto')} · limit ${formatNumber(job.params?.limit || 0)}</span>
                        </div>
                        ${badge(status, status.charAt(0).toUpperCase() + status.slice(1))}
                    </div>
                    <div class="job-stats">
                        <span class="job-stat"><strong>${formatNumber(job.found)}</strong> found</span>
                        <span class="job-stat"><strong>${formatNumber(job.added)}</strong> added</span>
                        <span class="job-stat"><strong>${formatNumber(job.updated)}</strong> merged</span>
                        <span class="job-stat"><strong>${formatNumber(job.enriched)}</strong> enriched</span>
                        <span class="job-stat"><strong>${formatNumber(job.skipped)}</strong> skipped</span>
                    </div>
                    <div class="job-progress">
                        <div class="job-progress-head">
                            <span>${status === 'running' ? 'Researching…' : status === 'completed' ? 'Complete' : status === 'failed' ? 'Failed' : 'Queued'}</span>
                            <span>${progress}%</span>
                        </div>
                        <div class="job-track"><span style="width:${progress}%"></span></div>
                    </div>
                    ${job.error ? `<div class="job-error">${escapeHtml(job.error)}</div>` : ''}
                    ${logs.length ? `<div class="job-log">${logs.map((entry) => `<span>${escapeHtml(entry.at ? new Date(entry.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '')} · ${escapeHtml(entry.message || '')}</span>`).join('')}</div>` : ''}
                </article>
            `;
        }).join('');
    }

    /* ---------- research modal ---------- */

    function openResearchModal() {
        const modal = $('#researchModal');
        if (!modal) return;
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        $('#researchMessage').textContent = '';
        $('#researchMessage').className = 'form-message';
        setTimeout(() => $('#countryChecks input')?.focus(), 40);
    }

    function closeResearchModal() {
        const modal = $('#researchModal');
        if (!modal) return;
        modal.hidden = true;
        document.body.style.overflow = '';
    }

    async function startResearch() {
        const checked = $$('#countryChecks input:checked, #countryChecksMore input:checked').map((input) => input.value);
        const cityText = $('#researchCities').value.trim();
        const cities = cityText ? cityText.split(',').map((city) => city.trim()).filter(Boolean) : [];
        const message = $('#researchMessage');
        const submit = $('#researchSubmit');

        if (!checked.length && !cities.length) {
            message.textContent = 'Select at least one country or enter a city.';
            message.className = 'form-message';
            return;
        }

        submit.disabled = true;
        submit.textContent = 'Starting…';
        message.textContent = '';
        try {
            const job = await api('/api/leads/research', {
                method: 'POST',
                body: {
                    countries: checked,
                    cities,
                    limit: Number($('#researchLimit').value) || 50,
                    source: $('#researchSource').value,
                    enrich: $('#researchEnrich').checked,
                    includeGeneral: $('#researchGeneral').checked
                }
            });
            closeResearchModal();
            toast(`Research run #${job.id} started.`);
            switchView('runs');
            await loadJobs();
        } catch (error) {
            message.textContent = error.message;
            message.className = 'form-message';
        } finally {
            submit.disabled = false;
            submit.textContent = 'Start research';
        }
    }

    /* ---------- CSV import / export ---------- */

    function openImportModal() {
        const modal = $('#importModal');
        if (!modal) return;
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        $('#importMessage').textContent = '';
        $('#importFile').value = '';
    }

    function closeImportModal() {
        const modal = $('#importModal');
        if (!modal) return;
        modal.hidden = true;
        document.body.style.overflow = '';
    }

    function parseCsv(text) {
        const rows = [];
        let row = [];
        let field = '';
        let quoted = false;
        const source = String(text || '').replace(/^\uFEFF/, '');
        for (let index = 0; index < source.length; index += 1) {
            const char = source[index];
            if (quoted) {
                if (char === '"') {
                    if (source[index + 1] === '"') {
                        field += '"';
                        index += 1;
                    } else {
                        quoted = false;
                    }
                } else {
                    field += char;
                }
            } else if (char === '"') {
                quoted = true;
            } else if (char === ',') {
                row.push(field);
                field = '';
            } else if (char === '\n') {
                row.push(field);
                field = '';
                rows.push(row);
                row = [];
            } else if (char !== '\r') {
                field += char;
            }
        }
        if (field.length || row.length) {
            row.push(field);
            rows.push(row);
        }
        if (!rows.length) return [];
        const headers = rows.shift().map((header) => String(header).trim().toLowerCase().replace(/\s+/g, '_'));
        return rows
            .filter((entry) => entry.some((value) => String(value).trim()))
            .map((entry) => {
                const record = {};
                headers.forEach((header, index) => {
                    record[header] = String(entry[index] ?? '').trim();
                });
                return record;
            });
    }

    function cleanImportedRow(row) {
        const aliases = {
            business: 'name',
            business_name: 'name',
            company: 'name',
            company_name: 'name',
            country: 'country',
            country_code: 'country_code',
            postcode: 'postal_code',
            postal_code: 'postal_code',
            phone_number: 'phone',
            telephone: 'phone',
            whatsapp_number: 'whatsapp',
            latitude: 'latitude',
            longitude: 'longitude',
            lat: 'latitude',
            lng: 'longitude',
            lon: 'longitude',
            url: 'website',
            web: 'website',
            e_mail: 'email'
        };
        const record = { ...row };
        for (const [from, to] of Object.entries(aliases)) {
            if (record[from] && !record[to]) record[to] = record[from];
        }
        if (record.latitude) record.latitude = Number(record.latitude);
        if (record.longitude) record.longitude = Number(record.longitude);
        if (record.services && typeof record.services === 'string') {
            record.services = record.services.split(/[;,]/).map((service) => service.trim()).filter(Boolean);
        }
        if (record.opt_out) record.opt_out = /^(1|true|yes)$/i.test(record.opt_out);
        record.source = 'csv-import';
        return record;
    }

    async function importCsv() {
        const input = $('#importFile');
        const message = $('#importMessage');
        const submit = $('#importSubmit');
        const file = input.files?.[0];
        if (!file) {
            message.textContent = 'Choose a CSV file first.';
            message.className = 'form-message';
            return;
        }
        submit.disabled = true;
        submit.textContent = 'Importing…';
        message.textContent = '';
        try {
            const rows = parseCsv(await file.text()).map(cleanImportedRow).filter((row) => row.name);
            if (!rows.length) throw new Error('No rows with a business name were found.');
            if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Import at most ${MAX_IMPORT_ROWS} rows at a time.`);
            const result = await api('/api/leads/import', {
                method: 'POST',
                body: { leads: rows, source: 'csv-import' }
            });
            closeImportModal();
            toast(`Imported ${result.inserted} new, merged ${result.updated}${result.skipped ? `, skipped ${result.skipped}` : ''}.`);
            refreshAfterChange();
            if (state.currentView === 'leads') loadLeads(true).catch(() => {});
        } catch (error) {
            message.textContent = error.message;
            message.className = 'form-message';
        } finally {
            submit.disabled = false;
            submit.textContent = 'Import';
        }
    }

    function exportCsv() {
        if (!state.session) return;
        const query = currentFilterQuery();
        const suffix = query ? `?${query}&session=${encodeURIComponent(state.session)}` : `?session=${encodeURIComponent(state.session)}`;
        window.open(`${API_BASE_URL}/api/leads/export${suffix}`, '_blank', 'noopener');
    }

    /* ---------- event wiring ---------- */

    function bindEvents() {
        $('#loginForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const button = $('#loginBtn');
            const message = $('#loginMessage');
            button.disabled = true;
            button.textContent = 'Checking…';
            message.textContent = '';
            try {
                await login($('#adminPassword').value);
            } catch (error) {
                message.textContent = error.message;
                message.className = 'form-message';
            } finally {
                button.disabled = false;
                button.textContent = 'Enter workspace';
            }
        });

        $('#passwordToggle')?.addEventListener('click', () => {
            const input = $('#adminPassword');
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            $('#passwordToggle').textContent = show ? 'Hide' : 'Show';
            $('#passwordToggle').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
            input.focus();
        });

        $('#logoutBtn')?.addEventListener('click', logout);

        $$('.nav-item[data-view]').forEach((button) => {
            button.addEventListener('click', () => switchView(button.dataset.view));
        });

        document.addEventListener('click', (event) => {
            const go = event.target.closest('[data-go-view]');
            if (go) {
                event.preventDefault();
                switchView(go.dataset.goView);
                return;
            }
            const open = event.target.closest('[data-open-research]');
            if (open) {
                event.preventDefault();
                openResearchModal();
            }
        });

        $('#openResearchBtn')?.addEventListener('click', openResearchModal);
        $('#researchClose')?.addEventListener('click', closeResearchModal);
        $('#researchCancel')?.addEventListener('click', closeResearchModal);
        $('#researchModal')?.addEventListener('click', (event) => {
            if (event.target === $('#researchModal')) closeResearchModal();
        });
        $('#researchForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            startResearch();
        });
        $('#selectPriorityBtn')?.addEventListener('click', () => {
            $$('#countryChecks input, #countryChecksMore input').forEach((input) => {
                input.checked = Number(input.dataset.priority) <= 3;
            });
        });
        $('#toggleAllCountries')?.addEventListener('click', () => {
            const more = $('#countryChecksMore');
            if (!more) return;
            more.hidden = !more.hidden;
            $('#toggleAllCountries').textContent = more.hidden
                ? `Show all ${$$('#countryChecksMore input').length} more countries`
                : 'Show fewer countries';
        });

        $('#exportBtn')?.addEventListener('click', exportCsv);
        $('#importBtn')?.addEventListener('click', openImportModal);
        $('#importClose')?.addEventListener('click', closeImportModal);
        $('#importCancel')?.addEventListener('click', closeImportModal);
        $('#importModal')?.addEventListener('click', (event) => {
            if (event.target === $('#importModal')) closeImportModal();
        });
        $('#importForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            importCsv();
        });

        $('#drawerClose')?.addEventListener('click', closeDrawer);
        $('#drawerBackdrop')?.addEventListener('click', closeDrawer);

        $('#mapFilter')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-map-filter]');
            if (!button) return;
            state.mapFilter = button.dataset.mapFilter;
            $$('#mapFilter button').forEach((entry) => entry.classList.toggle('active', entry === button));
            loadMap().catch((error) => toast(error.message, 'error'));
        });

        $('#filterPotential')?.addEventListener('change', applyFiltersFromControls);
        $('#filterCountry')?.addEventListener('change', applyFiltersFromControls);
        $('#filterStatus')?.addEventListener('change', applyFiltersFromControls);
        $('#filterPipeline')?.addEventListener('change', applyFiltersFromControls);
        $('#filterCompliance')?.addEventListener('change', applyFiltersFromControls);
        $('#clearFilters')?.addEventListener('click', () => {
            state.filters = { q: '', country: '', potential: '', status: '', pipeline: '', compliance: '' };
            $('#globalSearch').value = '';
            $('#leadSearch').value = '';
            $('#filterCountry').value = '';
            $('#filterPotential').value = '';
            $('#filterStatus').value = '';
            $('#filterPipeline').value = '';
            $('#filterCompliance').value = '';
            loadLeads(true).catch((error) => toast(error.message, 'error'));
        });

        const searchLeads = debounce(() => {
            state.filters.q = $('#leadSearch').value.trim();
            loadLeads(true).catch((error) => toast(error.message, 'error'));
        }, 250);
        $('#leadSearch')?.addEventListener('input', searchLeads);

        const globalSearch = debounce(() => {
            const value = $('#globalSearch').value.trim();
            state.filters.q = value;
            $('#leadSearch').value = value;
            if (state.currentView !== 'leads') {
                switchView('leads');
            } else {
                loadLeads(true).catch((error) => toast(error.message, 'error'));
            }
        }, 350);
        $('#globalSearch')?.addEventListener('input', globalSearch);
        $('#globalSearch')?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                state.filters.q = $('#globalSearch').value.trim();
                $('#leadSearch').value = state.filters.q;
                switchView('leads');
            }
        });

        $('#loadMoreBtn')?.addEventListener('click', () => {
            loadLeads(false).catch((error) => toast(error.message, 'error'));
        });

        $('#leadsBody')?.addEventListener('click', (event) => {
            if (event.target.closest('a')) return;
            const row = event.target.closest('tr[data-lead-id]');
            if (row) openLead(Number(row.dataset.leadId));
        });
        $('#leadsBody')?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const row = event.target.closest('tr[data-lead-id]');
            if (!row) return;
            event.preventDefault();
            openLead(Number(row.dataset.leadId));
        });

        $('#topLeads')?.addEventListener('click', (event) => {
            if (event.target.closest('[data-open-research]')) return;
            const card = event.target.closest('[data-lead-id]');
            if (card) openLead(Number(card.dataset.leadId));
        });
        $('#topLeads')?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const card = event.target.closest('[data-lead-id]');
            if (!card) return;
            event.preventDefault();
            openLead(Number(card.dataset.leadId));
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (!$('#importModal').hidden) {
                    closeImportModal();
                } else if (!$('#researchModal').hidden) {
                    closeResearchModal();
                } else if ($('#leadDrawer').classList.contains('open')) {
                    closeDrawer();
                }
                return;
            }
            if (event.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) {
                event.preventDefault();
                $('#globalSearch')?.focus();
            }
        });
    }

    function applyFiltersFromControls() {
        state.filters.country = $('#filterCountry').value;
        state.filters.potential = $('#filterPotential').value;
        state.filters.status = $('#filterStatus').value;
        state.filters.pipeline = $('#filterPipeline').value;
        state.filters.compliance = $('#filterCompliance').value;
        loadLeads(true).catch((error) => toast(error.message, 'error'));
    }

    function renderSources() {
        renderRollout();
    }

    /* ---------- init ---------- */

    async function init() {
        bindEvents();
        if (state.session) {
            const ok = await checkSession();
            if (ok) {
                showApp();
                try {
                    await loadWorkspace();
                } catch (error) {
                    showLogin(error.message || 'Could not load the lead workspace.');
                }
            }
        } else {
            showLogin();
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
