/* =====================================================================
   ClinixPro — Dashboard polish runtime helpers
   Exposed on window.CPDashboardPolish so the inline scripts in
   patient-dashboard.html and doctor-dashboard.html can call them
   without rewriting their existing rendering logic.

   API:
     CPDashboardPolish.startNotificationPolling(apiBase, opts)
         opts: { intervalMs?: number, onMessages?: (msgs)=>void }
     CPDashboardPolish.renderNotificationDropdown(listEl, messages, opts)
         opts: { onItemClick?: (msg)=>void, maxItems?: number }
     CPDashboardPolish.setUnreadCount(bellBtn, badgeEl, count)
     CPDashboardPolish.buildEmptyState(parent, kind, title?, hint?, ctaText?, onClick?)
     CPDashboardPolish.renderQuickBook(gridEl, doctors, opts)
         opts: { max?: number, onBook?: (doctor)=>void }
     CPDashboardPolish.renderTodaySchedule(timelineEl, dateEl, appointments)
   ===================================================================== */
(function () {
    "use strict";

    function safe(text, fallback) {
        if (text === null || text === undefined) return fallback || "";
        const s = String(text).trim();
        return s.length ? s : (fallback || "");
    }
    function escapeHTML(value) {
        return String(value === undefined || value === null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    function parseDate(value) {
        if (!value) return null;
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }
    function formatTime(date) {
        if (!date) return "";
        return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    function formatDateLong(date) {
        if (!date) return "";
        return date.toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric"
        });
    }
    function isSameDay(a, b) {
        return a && b &&
            a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate();
    }
    function authToken() {
        return localStorage.getItem("token") || localStorage.getItem("authToken") || "";
    }

    // ---------- Empty state ----------
    const EMPTY_STATE_PRESETS = {
        appointments:  { icon: "fa-regular fa-calendar-xmark",  title: "No appointments yet",         hint: "Book a slot to see it appear here." },
        messages:      { icon: "fa-regular fa-envelope-open",   title: "Inbox is clear",              hint: "Messages from your care team will arrive here." },
        prescriptions: { icon: "fa-solid fa-capsules",          title: "No prescriptions",            hint: "Your doctor's prescriptions will appear here." },
        billing:       { icon: "fa-regular fa-file-lines",      title: "No bills to show",            hint: "Invoices and payment history will appear here." },
        patients:      { icon: "fa-regular fa-id-card",         title: "No patients yet",             hint: "Patients you've consulted will appear here." },
        records:       { icon: "fa-regular fa-folder-open",     title: "No records yet",              hint: "Medical records will appear here once added." },
        tasks:         { icon: "fa-solid fa-list-check",        title: "All caught up",               hint: "Tasks assigned to you will show here." },
        doctors:       { icon: "fa-solid fa-user-doctor",       title: "No providers available",      hint: "Try again later — we'll list providers as soon as they're available." },
        schedule:      { icon: "fa-regular fa-clock",           title: "Nothing on the books today",  hint: "Enjoy a quieter day. New appointments will appear here." },
        generic:       { icon: "fa-regular fa-circle-question", title: "Nothing here yet",            hint: "Check back soon." }
    };

    function buildEmptyState(parent, kind, title, hint, ctaText, onClick) {
        if (!parent) return null;
        const preset = EMPTY_STATE_PRESETS[kind] || EMPTY_STATE_PRESETS.generic;
        const el = document.createElement("div");
        el.className = "cp-empty-state";
        el.innerHTML = `
            <div class="es-illustration"><i class="${preset.icon}"></i></div>
            <h3 class="es-title">${escapeHTML(title || preset.title)}</h3>
            <p class="es-hint">${escapeHTML(hint || preset.hint)}</p>
            ${ctaText ? `<button type="button" class="es-cta"><i class="fa-solid fa-arrow-right"></i> ${escapeHTML(ctaText)}</button>` : ""}
        `;
        if (ctaText && typeof onClick === "function") {
            el.querySelector(".es-cta").addEventListener("click", onClick);
        }
        parent.innerHTML = "";
        parent.appendChild(el);
        return el;
    }

    // ---------- Notification badge + dropdown ----------
    function setUnreadCount(bellBtn, badgeEl, count) {
        const n = Math.max(0, Number(count) || 0);
        if (bellBtn) bellBtn.setAttribute("data-unread", String(n));
        if (badgeEl) {
            badgeEl.textContent = n > 99 ? "99+" : String(n);
            badgeEl.style.display = n > 0 ? "" : "none";
        }
    }

    function renderNotificationDropdown(listEl, messages, opts) {
        if (!listEl) return;
        const options = opts || {};
        const maxItems = options.maxItems || 8;
        listEl.innerHTML = "";

        const items = (Array.isArray(messages) ? messages : []).slice(0, maxItems);
        if (!items.length) {
            const empty = document.createElement("div");
            empty.className = "notif-item empty";
            empty.textContent = "No new notifications";
            listEl.appendChild(empty);
            return;
        }

        items.forEach((msg) => {
            const row = document.createElement("div");
            row.className = "notif-item" + (msg.read ? "" : " unread");
            const subject = escapeHTML(safe(msg.subject, "Message"));
            const sender  = escapeHTML(safe(msg.from_name, "Someone"));
            const preview = escapeHTML(safe(msg.message, "").replace(/\s+/g, " "));
            const when    = parseDate(msg.timestamp || msg.created_at);
            const whenStr = when ? when.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

            row.innerHTML = `
                <span class="ni-icon"><i class="fa-regular fa-envelope${msg.read ? "-open" : ""}"></i></span>
                <div class="ni-body">
                    <div class="ni-subject">${subject}</div>
                    <div class="ni-preview">${sender}: ${preview}</div>
                    <div class="ni-meta">${escapeHTML(whenStr)}</div>
                </div>
            `;
            if (typeof options.onItemClick === "function") {
                row.addEventListener("click", () => options.onItemClick(msg));
            }
            listEl.appendChild(row);
        });
    }

    async function fetchInbox(apiBase) {
        const token = authToken();
        if (!token) return [];
        try {
            const res = await fetch(`${apiBase}/api/messages/inbox`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!res.ok) return [];
            const data = await res.json();
            if (Array.isArray(data)) return data;
            if (Array.isArray(data.messages)) return data.messages;
            if (Array.isArray(data.data)) return data.data;
            return [];
        } catch (_err) {
            return [];
        }
    }

    function startNotificationPolling(apiBase, opts) {
        const options = opts || {};
        const intervalMs = options.intervalMs || 60000;
        const cb = typeof options.onMessages === "function" ? options.onMessages : null;

        async function tick() {
            const messages = await fetchInbox(apiBase);
            if (cb) cb(messages);
        }
        tick();
        const handle = setInterval(tick, intervalMs);
        return {
            stop: () => clearInterval(handle),
            refresh: tick
        };
    }

    // ---------- Quick Book grid ----------
    function initials(name) {
        const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return "DR";
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function renderQuickBook(gridEl, doctors, opts) {
        if (!gridEl) return;
        const options = opts || {};
        const max = options.max || 6;
        const list = Array.isArray(doctors) ? doctors.slice(0, max) : [];
        gridEl.innerHTML = "";

        if (!list.length) {
            buildEmptyState(gridEl, "doctors");
            return;
        }

        list.forEach((doc) => {
            const name = safe(doc.name || doc.doctor_name || doc.full_name, "Doctor");
            const spec = safe(doc.specialization || doc.specialty || doc.department, "General practitioner");
            const card = document.createElement("div");
            card.className = "qb-doctor";
            card.innerHTML = `
                <span class="qb-avatar">${escapeHTML(initials(name))}</span>
                <div>
                    <p class="qb-name">${escapeHTML(name)}</p>
                    <p class="qb-spec">${escapeHTML(spec)}</p>
                </div>
                <button type="button" class="qb-book">
                    <i class="fa-solid fa-bolt"></i> Quick Book
                </button>
            `;
            card.querySelector(".qb-book").addEventListener("click", (evt) => {
                evt.preventDefault();
                if (typeof options.onBook === "function") options.onBook(doc);
            });
            gridEl.appendChild(card);
        });
    }

    // ---------- Today's Schedule timeline ----------
    function classifyEvent(date, durationMin) {
        if (!date) return "is-upcoming";
        const now = new Date();
        const endMs = date.getTime() + (durationMin || 30) * 60 * 1000;
        if (now.getTime() > endMs) return "is-past";
        if (now.getTime() >= date.getTime() && now.getTime() <= endMs) return "is-now";
        return "is-upcoming";
    }

    function renderTodaySchedule(timelineEl, dateEl, appointments) {
        if (!timelineEl) return;
        timelineEl.innerHTML = "";

        const today = new Date();
        if (dateEl) dateEl.textContent = formatDateLong(today);

        const list = (Array.isArray(appointments) ? appointments : [])
            .map((a) => ({
                raw: a,
                date: parseDate(a.date_time || a.datetime || a.appointment_date || a.date || a.starts_at)
            }))
            .filter((e) => e.date && isSameDay(e.date, today))
            .sort((a, b) => a.date - b.date);

        if (!list.length) {
            buildEmptyState(timelineEl, "schedule");
            return;
        }

        list.forEach((e) => {
            const a = e.raw;
            const patient = safe(a.patient_name || a.patient, "Patient");
            const reason  = safe(a.reason || a.note || a.purpose, "Consultation");
            const rawStatus = String(a.status || "scheduled").toLowerCase();
            const statusLabel = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);

            let cssClass = classifyEvent(e.date, a.duration_minutes);
            if (rawStatus === "cancelled" || rawStatus === "canceled") cssClass = "is-cancelled";
            if (rawStatus === "completed" || rawStatus === "done")     cssClass = "is-past";

            const ev = document.createElement("div");
            ev.className = "ts-event " + cssClass;
            ev.innerHTML = `
                <div class="ts-time">
                    ${escapeHTML(formatTime(e.date))}
                    <small>${e.date.getHours() < 12 ? "AM" : "PM"}</small>
                </div>
                <div class="ts-body">
                    <p class="ts-patient">${escapeHTML(patient)}</p>
                    <p class="ts-reason">${escapeHTML(reason)}</p>
                </div>
                <span class="ts-status">${escapeHTML(statusLabel)}</span>
            `;
            timelineEl.appendChild(ev);
        });
    }

    // ---------- Public API ----------
    window.CPDashboardPolish = {
        setUnreadCount,
        renderNotificationDropdown,
        startNotificationPolling,
        buildEmptyState,
        renderQuickBook,
        renderTodaySchedule
    };
})();
