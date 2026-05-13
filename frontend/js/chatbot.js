(function () {
    function safeText(value, fallback) {
        if (value === null || value === undefined) return fallback;
        const text = String(value).trim();
        return text ? text : fallback;
    }

    function detectUserType() {
        const role = safeText(localStorage.getItem("userRole") || localStorage.getItem("userType"), "").toLowerCase();
        if (role === "doctor" || role === "admin" || role === "patient") return role;
        const page = window.location.pathname.toLowerCase();
        if (page.includes("index.html") || page.endsWith("/") || page.includes("login.html")) return "visitor";
        if (page.includes("doctor-dashboard")) return "doctor";
        if (page.includes("dashboard.html") && !page.includes("doctor") && !page.includes("patient")) return "admin";
        return "patient";
    }

    function getApiBase() {
        return window.location.port === "5000" ? "" : "http://127.0.0.1:5000";
    }

    function formatTime(dateObj) {
        return dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    function normalizeText(value) {
        return safeText(value, "")
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function getTextTokens(text) {
        if (!text) return [];
        return text.split(" ").filter((token) => token.length > 1);
    }

    function scorePhraseMatch(normalizedText, textTokens, phrase) {
        const normalizedPhrase = normalizeText(phrase);
        if (!normalizedPhrase) return 0;
        if (normalizedText.includes(normalizedPhrase)) return 3;

        const phraseTokens = getTextTokens(normalizedPhrase);
        if (!phraseTokens.length) return 0;

        let matched = 0;
        for (let i = 0; i < phraseTokens.length; i += 1) {
            const pToken = phraseTokens[i];
            const hasSimilarToken = textTokens.some((t) => t === pToken || t.startsWith(pToken) || pToken.startsWith(t));
            if (hasSimilarToken) matched += 1;
        }

        const ratio = matched / phraseTokens.length;
        if (ratio >= 1) return 2.5;
        if (ratio >= 0.7) return 1.8;
        if (ratio >= 0.5) return 1.2;
        return 0;
    }

    function getLocalFallback(_normalizedText) {
        // Intentionally empty: greetings, generic help, and free-form
        // conversation must fall through to the Groq API so it can answer
        // with conversation history context. The knowledge base still
        // handles ClinixPro-specific intents above.
        return "";
    }

    function detectGeneralIntent(text) {
        if (!text) return "";
        if (/\b(login|sign in|password|register|sign up|account)\b/.test(text)) return "account";
        if (/\b(book|booking|appointment|schedule|slot)\b/.test(text)) return "appointment";
        if (/\b(prescription|medicine|medication|rx|record|clinical)\b/.test(text)) return "clinical";
        if (/\b(billing|invoice|payment|charges|revenue|pricing|plan)\b/.test(text)) return "billing";
        if (/\b(support|ticket|contact|helpdesk|complaint)\b/.test(text)) return "support";
        if (/\b(report|analytics|kpi|dashboard)\b/.test(text)) return "reporting";
        return "";
    }

    function isFollowUpMessage(text) {
        // A follow-up must explicitly chain to a prior turn. The previous
        // `text.length < 14` heuristic mis-classified greetings like "hello"
        // and "hi" as follow-ups, causing them to replay a stale
        // getContextualFollowUp(lastIntentContext) response.
        return /\b(and then|then what|next step|what else|what next|after that|now what|ok now|continue|go on|tell me more)\b/.test(text);
    }

    function isGreeting(text) {
        // Pure greetings should fall through to Groq so the LLM can reply
        // contextually — and they reset the local intent state so the bot
        // doesn't keep re-firing the last troubleshooting flow.
        return /^(hi|hii+|hello+|hey+|hiya|hola|yo|sup|good\s+(morning|afternoon|evening|day|night)|greetings|howdy|salam|assalam)\b/.test(text);
    }

    function getContextualFollowUp(intent) {
        if (intent === "account") return "Next best step: verify credentials, then use password reset if needed. If it still fails, I can generate a support ticket draft.";
        if (intent === "appointment") return "Next, verify appointment status in history and enable reminders. If no slots appear, try another date or provider.";
        if (intent === "clinical") return "Next, verify prescription/record fields are complete, then save and reopen once to confirm details are stored.";
        if (intent === "billing") return "Next, verify service entries, regenerate invoice, and confirm payment sync. If mismatch remains, escalate via ticket.";
        if (intent === "support") return "Next, include role, module name, exact error text, and screenshot in your support ticket for faster resolution.";
        if (intent === "reporting") return "Next, focus on no-show rate, turnaround time, and payment lag first for fastest operational gains.";
        return "";
    }

    function getDisclaimer(userType) {
        if (userType === "visitor") {
            return "I'm Clio, your AI Health Assistant. I can guide you through registration, login, appointments, prescriptions, patient records, billing, support, and troubleshooting. Ask me anything about ClinixPro workflows.";
        }
        if (userType === "doctor") {
            return "I'm Clio, your AI Health Assistant for doctor workflows. I can help with appointments, patient records, prescriptions, schedule updates, and dashboard navigation. For clinical decisions, always verify with guidelines and your professional judgment.";
        }
        if (userType === "admin") {
            return "I'm Clio, your AI Health Assistant for clinic operations. I can help with user management, appointments, billing flow, support tickets, and operational best practices. Confirm policy-critical decisions with management.";
        }
        return "I'm Clio, your AI Health Assistant. I can help with booking appointments, checking prescriptions, updating profile details, and understanding your dashboard. This assistant is informational only and not a diagnosis.";
    }

    function buildKnowledgeBase(currentUserType) {
        const common = [
            {
                // Only fire when the user is asking ABOUT THE BOT — never on
                // statements like "my name is Arham" or "what's my name".
                keywords: ["who are you", "whats your name", "what is your name", "what's your name", "introduce yourself", "tell me about yourself"],
                reply: "I'm Clio, your AI Health Assistant for ClinixPro. I help you navigate workflows faster and solve common platform questions."
            },
            {
                keywords: ["what can you do", "your capabilities", "list your features", "available commands"],
                reply:
                    "I can help with:\n" +
                    "1) Account setup: register, login, and password guidance.\n" +
                    "2) Navigation: where to find key pages and actions.\n" +
                    "3) Workflows: appointments, records, prescriptions, billing, and support.\n" +
                    "4) Troubleshooting: common errors and quick fixes.\n" +
                    "Try: 'How do I book an appointment?' or 'I can't login'."
            },
            {
                keywords: ["what is clinixpro", "about clinixpro", "platform"],
                reply:
                    "ClinixPro is a smart clinical management platform that centralizes scheduling, patient data, prescriptions, communication, and billing. It is designed to reduce admin burden, improve team coordination, and help clinics run efficiently."
            },
            {
                keywords: ["register", "sign up", "create account"],
                reply:
                    "To register on ClinixPro:\n" +
                    "1) Open the Register page from the top bar.\n" +
                    "2) Enter required personal/clinic information.\n" +
                    "3) Choose the correct role (patient, doctor, or admin).\n" +
                    "4) Submit the form and verify details.\n" +
                    "If registration fails, check email format, required fields, and internet connection, then try again."
            },
            {
                keywords: ["login", "sign in", "cannot login", "can't login", "password"],
                reply:
                    "Login checklist:\n" +
                    "1) Confirm correct email/username and password.\n" +
                    "2) Make sure Caps Lock is off.\n" +
                    "3) Verify you are on the correct portal page.\n" +
                    "4) If still blocked, reset password or contact support.\n" +
                    "If you share the exact error shown on screen, I can guide you step-by-step."
            },
            {
                keywords: ["support", "contact", "helpdesk", "ticket", "whatsapp", "email"],
                reply:
                    "Support options:\n" +
                    "- Open Support/Tickets page for formal issue tracking.\n" +
                    "- Email: supportclinixpro@gmail.com\n" +
                    "- WhatsApp/Phone shown in the footer for urgent coordination.\n" +
                    "Best practice: include your role, page name, timestamp, and screenshot for faster resolution."
            },
            {
                keywords: ["security", "privacy", "data protection", "safe", "hipaa"],
                reply:
                    "ClinixPro follows role-based access and secure handling practices. For safer use:\n" +
                    "1) Do not share credentials.\n" +
                    "2) Use strong unique passwords.\n" +
                    "3) Log out on shared devices.\n" +
                    "4) Report suspicious access immediately to admin/support."
            },
            {
                keywords: ["slow", "error", "not working", "bug", "issue", "problem"],
                reply:
                    "Quick troubleshooting flow:\n" +
                    "1) Refresh the page.\n" +
                    "2) Check internet stability.\n" +
                    "3) Clear browser cache for the site.\n" +
                    "4) Try another browser/device.\n" +
                    "5) If issue persists, share exact error text and your last action."
            }
        ];

        const visitor = [
            {
                keywords: ["pricing", "plan", "subscription", "payment", "nayapay"],
                reply:
                    "ClinixPro provides structured plans for different clinic sizes. You can view current packages on the home page pricing section. For payment activation, follow the listed NayaPay and verification instructions, then share payment proof with the support contact."
            },
            {
                keywords: ["demo", "trial", "watch demo"],
                reply: "Use the demo/watch flow on the homepage CTA to explore the platform quickly. If you want, I can also explain each core module before you register."
            }
        ];

        const patient = [
            {
                keywords: ["book appointment", "appointment", "schedule visit", "doctor slot"],
                reply:
                    "To book an appointment:\n" +
                    "1) Open your patient dashboard.\n" +
                    "2) Go to appointments/booking section.\n" +
                    "3) Select doctor, date, and available time slot.\n" +
                    "4) Add notes if needed and confirm.\n" +
                    "Then check appointment history/status for updates."
            },
            {
                keywords: ["prescription", "medication", "medicine", "view prescription"],
                reply: "Open your Prescriptions area in the dashboard to view medicine details, dosage instructions, and doctor notes. Always follow your clinician guidance for treatment decisions."
            },
            {
                keywords: ["profile", "update profile", "edit profile", "phone", "address"],
                reply: "In your dashboard profile/settings page, update your contact and personal details, then save changes. Keep phone and emergency contact information current for clinic communication."
            }
        ];

        const doctor = [
            {
                keywords: ["patient record", "complete record", "clinical note", "soap"],
                reply:
                    "For complete patient records:\n" +
                    "1) Open today's appointment list.\n" +
                    "2) Select patient and open record editor.\n" +
                    "3) Enter assessment/notes, diagnosis context, and plan.\n" +
                    "4) Save carefully before moving to next patient.\n" +
                    "Use consistent structured notes for better continuity."
            },
            {
                keywords: ["create prescription", "write prescription", "rx"],
                reply:
                    "Prescription flow:\n" +
                    "1) Open the patient profile/encounter.\n" +
                    "2) Select prescription module.\n" +
                    "3) Add medication, strength, frequency, duration, and instructions.\n" +
                    "4) Review for safety/clarity and save."
            },
            {
                keywords: ["availability", "schedule", "working hours", "doctor slots"],
                reply: "Update availability from your schedule/settings area. Keep slots accurate to reduce booking conflicts and no-shows."
            }
        ];

        const admin = [
            {
                keywords: ["user management", "add doctor", "staff", "roles", "permissions"],
                reply:
                    "Admin role management tips:\n" +
                    "1) Assign least-privilege access by role.\n" +
                    "2) Review active users periodically.\n" +
                    "3) Disable stale/inactive accounts.\n" +
                    "4) Audit access changes for accountability."
            },
            {
                keywords: ["billing", "invoice", "payment tracking", "revenue"],
                reply:
                    "For billing operations:\n" +
                    "1) Verify service entries are complete.\n" +
                    "2) Generate invoices with correct patient and service details.\n" +
                    "3) Track paid/unpaid states.\n" +
                    "4) Reconcile records regularly for clean reporting."
            },
            {
                keywords: ["report", "dashboard metrics", "analytics", "kpi"],
                reply: "Use dashboard reporting to monitor appointment volume, utilization, follow-ups, and billing status. Focus first on no-show rate, turnaround time, and payment lag for operational improvement."
            }
        ];

        if (currentUserType === "patient") return common.concat(patient);
        if (currentUserType === "doctor") return common.concat(doctor);
        if (currentUserType === "admin") return common.concat(admin);
        return common.concat(visitor);
    }

    // Patterns that are clearly personal/general conversation and must NEVER
    // be handled locally. Anything matching here goes straight to Groq so the
    // conversation history is used to give a contextual answer.
    // NOTE: `text` is already normalized (lowercased, punctuation replaced
    // with spaces, whitespace collapsed). So "What's my name?" arrives as
    // "what s my name".
    function isPersonalConversation(text) {
        if (!text) return false;
        // Anything mentioning "my name" — handles "my name is X",
        // "what's my name", "do you know/remember my name", etc.
        if (/\bmy\s+name\b/.test(text)) return true;
        // Asking the bot to remember something about the user.
        if (/\bremember\s+me\b/.test(text)) return true;
        if (/\bcall\s+me\b/.test(text)) return true;
        return false;
    }

    function getLocalReply(message) {
        const guidedReply = getGuidedFlowReply(message);
        if (guidedReply) return guidedReply;

        const text = normalizeText(message);
        if (!text) return "";

        // Greetings: clear any leftover intent context from a previous chat
        // turn and let Groq generate a contextual welcome. Without this,
        // typing "hello" after a login-troubleshooting flow replays the
        // stale "Next best step: verify credentials..." message.
        if (isGreeting(text)) {
            lastIntentContext = "";
            return "";
        }

        // Hard short-circuit for personal/general talk — these must reach Groq
        // with conversation history so the model can remember the user's name.
        if (isPersonalConversation(text)) return "";

        const textTokens = getTextTokens(text);
        const detectedIntent = detectGeneralIntent(text);

        if (isFollowUpMessage(text) && !detectedIntent && lastIntentContext) {
            const contextual = getContextualFollowUp(lastIntentContext);
            if (contextual) return contextual;
        }

        const knowledgeBase = buildKnowledgeBase(userType);
        let bestMatch = "";
        let bestScore = 0;
        let bestStrongMatches = 0;

        for (let i = 0; i < knowledgeBase.length; i += 1) {
            const item = knowledgeBase[i];
            let score = 0;
            let strongMatches = 0;
            for (let j = 0; j < item.keywords.length; j += 1) {
                const phraseScore = scorePhraseMatch(text, textTokens, item.keywords[j]);
                score += phraseScore;
                if (phraseScore >= 1.8) strongMatches += 1;
            }
            if (strongMatches > 1) {
                score += 1;
            }
            if (score > bestScore) {
                bestScore = score;
                bestMatch = item.reply;
                bestStrongMatches = strongMatches;
            }
        }

        // Only fire a canned reply when the user's text actually contains one of
        // the keyword phrases (a "strong" substring match). This prevents the
        // knowledge base from intercepting general conversation like
        // "what's my name" where multiple weak partial-token matches would
        // otherwise sum above the threshold and block Groq from answering.
        if (bestScore >= 1.5 && bestStrongMatches >= 1) {
            if (detectedIntent) lastIntentContext = detectedIntent;
            return bestMatch;
        }
        const fallback = getLocalFallback(text);
        if (fallback && detectedIntent) lastIntentContext = detectedIntent;
        return fallback;
    }

    const userType = detectUserType();
    const userId = Number(localStorage.getItem("userId") || 0) || 0;
    const storageKey = `clinixpro_chat_history_${userType}_${userId || "guest"}`;
    const escalationDraftKey = `clinixpro_support_draft_${userType}_${userId || "guest"}`;
    const API_BASE = getApiBase();

    // ---------- One-shot history migration ----------
    // Before May-2026 the server-side system prompt described Clio as a
    // "navigation assistant", which made the Groq LLM hallucinate the name
    // "Nav" for itself. Persisted history still contains those replies. On
    // first load after the fix, wipe any conversation that mentions the old
    // name so users see the clean "I'm Clio..." greeting again.
    const CHAT_MIGRATION_KEY = "clinixpro_chat_migration";
    const CHAT_MIGRATION_VERSION = "2026-05-clio-rename";
    try {
        if (localStorage.getItem(CHAT_MIGRATION_KEY) !== CHAT_MIGRATION_VERSION) {
            const stalePattern = /\b(name is nav|i'?m nav|i am nav|call me nav)\b/i;
            Object.keys(localStorage).forEach((key) => {
                if (!key.startsWith("clinixpro_chat_history_")) return;
                const raw = localStorage.getItem(key) || "";
                if (stalePattern.test(raw)) localStorage.removeItem(key);
            });
            localStorage.setItem(CHAT_MIGRATION_KEY, CHAT_MIGRATION_VERSION);
        }
    } catch (_migrationErr) {
        /* localStorage unavailable — skip migration silently. */
    }

    const isVisitorMode = userType === "visitor";
    const pagePath = window.location.pathname.toLowerCase();
    let suggestions = [
        "How do I register?",
        "How do I login?",
        "What is ClinixPro?",
        "How do I contact support?"
    ];
    if (pagePath.includes("patient-dashboard")) {
        suggestions = [
            "How do I book an appointment?",
            "How do I view my prescriptions?",
            "How do I update my profile?",
            "What are the clinic hours?",
            "I cannot login, what should I do?"
        ];
    } else if (pagePath.includes("doctor-dashboard")) {
        suggestions = [
            "How do I complete a patient record?",
            "How do I create a prescription?",
            "How do I view today's appointments?",
            "How do I update my availability?",
            "Best practices for clinical notes"
        ];
    } else if (pagePath.includes("dashboard.html")) {
        suggestions = [
            "How do I manage user roles?",
            "How do I track billing status?",
            "What reports should I monitor?",
            "How do I contact support quickly?"
        ];
    }

    const toggle = document.createElement("button");
    toggle.className = "cp-chatbot-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Open AI Assistant");
    toggle.innerHTML = '<i class="fa-solid fa-robot"></i>';

    const panel = document.createElement("section");
    panel.className = "cp-chatbot-panel";
    panel.innerHTML = `
        <header class="cp-chatbot-head">
            <div class="cp-chatbot-brand">
                <div class="cp-chatbot-avatar" aria-hidden="true">
                    <i class="fa-solid fa-robot"></i>
                </div>
                <div class="cp-chatbot-brand-text">
                    <h3>Clio</h3>
                    <small><span class="cp-online-dot"></span> Your AI Health Assistant</small>
                </div>
            </div>
            <div class="cp-chatbot-head-actions">
                <button class="cp-chatbot-head-btn" id="cpChatClearBtn" title="Clear chat"><i class="fa-solid fa-trash"></i></button>
                <button class="cp-chatbot-head-btn" id="cpChatCloseBtn" title="Close"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </header>
        <div id="cpChatBody" class="cp-chatbot-body"></div>
        <div id="cpChatTyping" class="cp-chat-typing" aria-live="polite">
            <span>Assistant is typing</span>
            <span class="cp-typing-dots" aria-hidden="true">
                <i></i><i></i><i></i>
            </span>
        </div>
        <div id="cpChatQuick" class="cp-chat-quick"></div>
        <div id="cpChatSuggestions" class="chat-suggestions"></div>
        <div class="cp-chat-input-wrap">
            <button class="cp-chat-icon-btn" type="button" aria-label="Open emoji options">
                <i class="fa-regular fa-face-smile"></i>
            </button>
            <input id="cpChatInput" class="cp-chat-input" type="text" placeholder="${isVisitorMode ? "Ask about login, register, or features..." : "Ask a medical or clinic question..."}" maxlength="1500" />
            <button id="cpChatSendBtn" class="cp-chat-send" type="button">Send</button>
        </div>
    `;

    document.body.appendChild(toggle);
    document.body.appendChild(panel);

    const chatBody = panel.querySelector("#cpChatBody");
    const chatInput = panel.querySelector("#cpChatInput");
    const sendBtn = panel.querySelector("#cpChatSendBtn");
    const closeBtn = panel.querySelector("#cpChatCloseBtn");
    const clearBtn = panel.querySelector("#cpChatClearBtn");
    const typing = panel.querySelector("#cpChatTyping");
    const quickActionsWrap = panel.querySelector("#cpChatQuick");
    const suggestionsWrap = panel.querySelector("#cpChatSuggestions");
    const emojiBtn = panel.querySelector(".cp-chat-icon-btn");
    let suggestionsHidden = false;
    let activeFlow = "";
    let flowStep = 0;
    let flowRetryCount = 0;
    let lastIntentContext = "";
    let lastEscalationMeta = { topic: "", timestamp: 0 };

    // Conversation context sent to the backend on every /api/chat call.
    // Items follow the OpenAI/Groq format: { role: "user"|"assistant", content: string }.
    const conversationHistory = [];
    function pushHistory(role, content) {
        const text = safeText(content, "");
        if (!text) return;
        const apiRole = role === "bot" || role === "assistant" ? "assistant" : "user";
        conversationHistory.push({ role: apiRole, content: text });
        // Keep an upper bound client-side too so the payload stays small.
        if (conversationHistory.length > 40) {
            conversationHistory.splice(0, conversationHistory.length - 40);
        }
    }
    function seedConversationHistoryFromStorage() {
        conversationHistory.length = 0;
        const stored = readHistory();
        stored.forEach((m) => {
            if (m && (m.role === "user" || m.role === "bot")) {
                pushHistory(m.role, m.text);
            }
        });
    }

    function readHistory() {
        try {
            const data = JSON.parse(localStorage.getItem(storageKey) || "[]");
            if (!Array.isArray(data)) return [];
            // Drop any blank or whitespace-only entries — they would render
            // as empty bubbles.
            return data.filter((m) => m && typeof m.text === "string" && m.text.trim().length > 0);
        } catch (_err) {
            return [];
        }
    }

    function writeHistory(history) {
        localStorage.setItem(storageKey, JSON.stringify(history.slice(-100)));
    }

    function getLastBotMessage() {
        const history = readHistory();
        for (let i = history.length - 1; i >= 0; i -= 1) {
            if (history[i].role === "bot") return safeText(history[i].text, "");
        }
        return "";
    }

    function isAffirmative(text) {
        return /\b(yes|y|done|fixed|resolved|worked|ok|great|thanks)\b/.test(text);
    }

    function isNegative(text) {
        return /\b(no|n|not|still|unable|cant|failed|error|problem|issue)\b/.test(text);
    }

    function detectFlowIntent(text) {
        if (/\b(login|sign in|password|cannot login|cant login|forgot)\b/.test(text)) return "login";
        if (/\b(book|booking|appointment|schedule|slot)\b/.test(text)) return "booking";
        if (/\b(prescription|medicine|medication|rx)\b/.test(text)) return "prescription";
        if (/\b(billing|invoice|payment|charges|revenue)\b/.test(text)) return "billing";
        if (/\b(support|ticket|contact|helpdesk|complaint)\b/.test(text)) return "support";
        return "";
    }

    function buildEscalationDraft(topic, originalMessage) {
        const nowMs = Date.now();
        const sameTopicRecent = lastEscalationMeta.topic === topic && (nowMs - lastEscalationMeta.timestamp) < 120000;
        if (sameTopicRecent) {
            return (
                "I already prepared a recent support draft for this issue.\n" +
                "Please tap Create Ticket below and submit it, then share any new details if available."
            );
        }

        const draftPayload = {
            source: "clio-chatbot",
            role: userType,
            category: topic.toLowerCase() === "billing" ? "billing" : (topic.toLowerCase() === "login" ? "account" : "technical"),
            subject: `${topic} issue in ClinixPro`,
            message:
                `Role: ${userType}\n` +
                `Issue summary: ${safeText(originalMessage, "Persistent issue reported by user.")}\n` +
                "Steps already attempted: Guided troubleshooting via Clio (2 rounds)\n" +
                "Requested help: Please investigate and advise a fix path."
        };
        localStorage.setItem(escalationDraftKey, JSON.stringify(draftPayload));
        lastEscalationMeta = { topic, timestamp: nowMs };

        return (
            "Escalation created successfully. I prepared your support draft.\n" +
            "Tap Create Ticket below to open the pre-filled form.\n" +
            "-----\n" +
            "Support draft preview:\n" +
            "-----\n" +
            `Subject: ${topic} issue in ClinixPro\n` +
            `Role: ${userType}\n` +
            `Issue summary: ${safeText(originalMessage, "Persistent issue reported by user.")}\n` +
            "Steps already attempted: Guided troubleshooting via Clio (2 rounds)\n" +
            "Requested help: Please investigate and advise a fix path.\n" +
            "-----\n" +
            "Before submitting, add these details for faster resolution:\n" +
            "1) Screenshot of the error\n" +
            "2) Exact error text/code\n" +
            "3) Time when issue occurred"
        );
    }

    function openPrefilledTicketForm() {
        window.location.href = "support.html#form";
    }

    function openShortcut(target) {
        if (!target || !target.page) return;
        const currentPath = window.location.pathname.toLowerCase();
        const targetPage = String(target.page).toLowerCase();
        const onTargetPage = currentPath.endsWith(targetPage) || currentPath.includes(`/${targetPage}`);

        if (onTargetPage && target.section) {
            const sideLink = document.querySelector(`.side-link[data-section="${target.section}"]`);
            if (sideLink) {
                sideLink.click();
                return;
            }
            const sectionEl = document.getElementById(target.section);
            if (sectionEl) {
                sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
            }
        }

        if (onTargetPage && target.anchor) {
            const anchorEl = document.querySelector(target.anchor);
            if (anchorEl) {
                anchorEl.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
            }
        }

        const hash = target.section ? `#${target.section}` : (target.anchor || "");
        window.location.href = `${target.page}${hash}`;
    }

    function showNavigationFeedback(target) {
        const label = safeText(target.page, "requested section");
        const note = `Navigating to ${label}...`;
        const now = formatTime(new Date());
        const updated = readHistory();
        updated.push({ role: "bot", text: note, timestamp: now });
        writeHistory(updated);
        appendMessage("bot", note, now);
    }

    function getGuidedFlowReply(rawMessage) {
        const text = normalizeText(rawMessage);
        if (!text) return "";

        if (!activeFlow) {
            const intent = detectFlowIntent(text);
            if (!intent) return "";
            activeFlow = intent;
            lastIntentContext = detectGeneralIntent(text) || intent;
            flowStep = 1;
            flowRetryCount = 0;

            if (intent === "login") {
                return (
                    "Let's fix login step-by-step.\n" +
                    "Step 1: check email/password and Caps Lock.\n" +
                    "Reply with one option:\n" +
                    "1) Invalid credentials\n" +
                    "2) Forgot password\n" +
                    "3) Login page not loading"
                );
            }
            if (intent === "booking") {
                return (
                    "Appointment booking flow:\n" +
                    "1) Dashboard -> Appointments -> Book Appointment\n" +
                    "2) Select doctor, date, and slot\n" +
                    "3) Confirm and verify status in history\n" +
                    "Did this work? Reply yes/no."
                );
            }
            if (intent === "prescription") {
                return (
                    "Prescription flow:\n" +
                    "- Patient: Dashboard -> Prescriptions\n" +
                    "- Doctor: Patient record -> Prescription module -> Save\n" +
                    "Did this solve your issue? Reply yes/no."
                );
            }
            if (intent === "billing") {
                return (
                    "Billing flow:\n" +
                    "1) Verify service entries\n" +
                    "2) Generate invoice\n" +
                    "3) Track paid/unpaid status\n" +
                    "4) Reconcile records\n" +
                    "Still facing an issue? Reply yes/no."
                );
            }
            return (
                "Support flow:\n" +
                "1) Open Tickets/Support page\n" +
                "2) Add role, module, exact error, screenshot\n" +
                "3) Submit with urgency\n" +
                "Need a support draft format? Reply yes."
            );
        }

        if (activeFlow === "login" && flowStep === 1) {
            flowStep = 2;
            if (text.includes("1") || text.includes("invalid")) {
                return "For invalid credentials: re-enter details carefully and reset password if needed. Did this resolve login? Reply yes/no.";
            }
            if (text.includes("2") || text.includes("forgot")) {
                return "Use Forgot Password, complete email reset, then login with the new password. Did this resolve login? Reply yes/no.";
            }
            if (text.includes("3") || text.includes("loading") || text.includes("page")) {
                return "If page does not load: refresh, clear cache, disable extensions/VPN, and try another browser. Did this resolve login? Reply yes/no.";
            }
            return "Please reply with 1, 2, or 3 for the exact login path.";
        }

        if (activeFlow && isAffirmative(text)) {
            activeFlow = "";
            flowStep = 0;
            flowRetryCount = 0;
            return "Great, issue marked resolved. Need prevention tips too?";
        }

        if (activeFlow && isNegative(text)) {
            flowRetryCount += 1;
            if (flowRetryCount >= 2) {
                const topic = activeFlow.charAt(0).toUpperCase() + activeFlow.slice(1);
                const escalation = buildEscalationDraft(topic, rawMessage);
                activeFlow = "";
                flowStep = 0;
                flowRetryCount = 0;
                return escalation;
            }
            return "Understood. Try once more from a different browser/device after refreshing. If still not fixed, reply no and I will generate a support escalation draft.";
        }

        if (activeFlow === "support" && /\byes\b/.test(text)) {
            return (
                "Support ticket format:\n" +
                "1) Issue title\n" +
                "2) Role + page/module\n" +
                "3) Steps to reproduce\n" +
                "4) Error message/screenshots\n" +
                "5) Impact and urgency"
            );
        }

        return "";
    }

    function getQuickActionsForRole(currentUserType) {
        if (currentUserType === "patient") {
            return [
                { label: "Open Appointments", action: "navigate", target: { page: "patient-dashboard.html", section: "appointments" }, prompt: "How do I book an appointment?" },
                { label: "Open Prescriptions", action: "navigate", target: { page: "patient-dashboard.html", section: "prescriptions" }, prompt: "How do I view my prescriptions?" },
                { label: "Open Profile", action: "navigate", target: { page: "patient-dashboard.html", section: "profile" }, prompt: "How do I update my profile?" },
                { label: "Support", prompt: "How do I contact support?" },
                { label: "Create Ticket", action: "open-ticket-form" }
            ];
        }
        if (currentUserType === "doctor") {
            return [
                { label: "Open Appointments", action: "navigate", target: { page: "doctor-dashboard.html", section: "appointments" }, prompt: "How do I view today's appointments?" },
                { label: "Open Records", action: "navigate", target: { page: "doctor-dashboard.html", section: "records" }, prompt: "How do I complete a patient record?" },
                { label: "Create Rx", action: "navigate", target: { page: "doctor-dashboard.html", section: "prescriptions" }, prompt: "How do I create a prescription?" },
                { label: "Open Profile", action: "navigate", target: { page: "doctor-dashboard.html", section: "profile" }, prompt: "How do I update my availability?" },
                { label: "Create Ticket", action: "open-ticket-form" }
            ];
        }
        if (currentUserType === "admin") {
            return [
                { label: "Open Dashboard", action: "navigate", target: { page: "dashboard.html" }, prompt: "What reports should I monitor?" },
                { label: "Open Pending Reviews", action: "navigate", target: { page: "dashboard.html#pending-doctors" }, prompt: "How do I manage user roles?" },
                { label: "Billing Help", prompt: "How do I track billing status?" },
                { label: "Support", prompt: "How do I contact support quickly?" },
                { label: "Create Ticket", action: "open-ticket-form" }
            ];
        }
        return [
            { label: "Open Register", action: "navigate", target: { page: "register.html" }, prompt: "How do I register?" },
            { label: "Open Login", action: "navigate", target: { page: "login.html" }, prompt: "I cannot login, what should I do?" },
            { label: "Plans & Pricing", action: "navigate", target: { page: "index.html#features" }, prompt: "Tell me about pricing plans" },
            { label: "Support Form", action: "navigate", target: { page: "support.html", anchor: "#form" }, prompt: "How do I contact support?" },
            { label: "Create Ticket", action: "open-ticket-form" }
        ];
    }

    function renderQuickActions() {
        if (!quickActionsWrap) return;
        quickActionsWrap.innerHTML = "";
        const actions = getQuickActionsForRole(userType);
        actions.forEach((action) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = action.label;
            btn.addEventListener("click", function () {
                if (action.action === "open-ticket-form") {
                    openPrefilledTicketForm();
                    return;
                }
                if (action.action === "navigate") {
                    showNavigationFeedback(action.target || {});
                    openShortcut(action.target);
                    return;
                }
                chatInput.value = action.prompt;
                sendMessageFromText(action.prompt);
            });
            quickActionsWrap.appendChild(btn);
        });
    }

    function appendMessage(role, text, timestamp) {
        // Skip blank/whitespace messages so we never render an empty bubble.
        const safe = safeText(text, "");
        if (!safe || !safe.trim()) return;
        const row = document.createElement("div");
        row.className = `cp-chat-row ${role === "user" ? "user" : "bot"}`;
        row.innerHTML = `
            <div class="cp-chat-bubble">${safe}</div>
            <span class="cp-chat-time">${safeText(timestamp, formatTime(new Date()))}</span>
        `;
        chatBody.appendChild(row);
        chatBody.scrollTop = chatBody.scrollHeight;
    }

    function renderHistory() {
        chatBody.innerHTML = "";
        const history = readHistory();
        if (!history.length) {
            const disclaimer = getDisclaimer(userType);
            const now = formatTime(new Date());
            const seed = [{ role: "bot", text: disclaimer, timestamp: now }];
            writeHistory(seed);
            appendMessage("bot", disclaimer, now);
            return;
        }
        history.forEach((m) => appendMessage(m.role, m.text, m.timestamp));
    }

    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) return;
        await sendMessageFromText(message);
    }

    async function sendMessageFromText(message) {
        message = (message || "").trim();
        if (!message) return;
        if (!suggestionsHidden && suggestionsWrap) {
            suggestionsWrap.style.display = "none";
            suggestionsHidden = true;
        }
        const now = formatTime(new Date());
        const history = readHistory();
        const userMsg = { role: "user", text: message, timestamp: now };
        history.push(userMsg);
        writeHistory(history);
        appendMessage("user", message, now);
        chatInput.value = "";

        // Snapshot prior turns BEFORE adding the current user message so the
        // server can append it itself (matches the documented contract).
        const priorHistory = conversationHistory.slice();
        pushHistory("user", message);

        typing.classList.add("show");
        sendBtn.disabled = true;
        try {
            const localReply = getLocalReply(message);
            // Debug aid: log whether the local handler matched. An empty string
            // means the message will be sent to Groq with conversation history.
            console.log("[chatbot] Local reply:", localReply ? localReply.slice(0, 80) + (localReply.length > 80 ? "…" : "") : "(none — sending to Groq)");
            if (localReply) {
                const lastBotText = getLastBotMessage();
                const finalLocalReply = lastBotText === localReply
                    ? "Looks like this is similar to your previous question. Share your current exact issue/error and I will give the next specific step."
                    : localReply;
                const botNowLocal = formatTime(new Date());
                const updatedLocal = readHistory();
                updatedLocal.push({ role: "bot", text: finalLocalReply, timestamp: botNowLocal });
                writeHistory(updatedLocal);
                appendMessage("bot", finalLocalReply, botNowLocal);
                pushHistory("assistant", finalLocalReply);
                return;
            }

            const res = await fetch(`${API_BASE}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message,
                    user_type: userType,
                    user_id: userId,
                    history: priorHistory
                })
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(safeText(payload.error || payload.message, "AI request failed"));
            }
            const botText = safeText(payload.response, "I am sorry, I could not generate a response.");
            const botNow = formatTime(new Date());
            const updated = readHistory();
            updated.push({ role: "bot", text: botText, timestamp: botNow });
            writeHistory(updated);
            appendMessage("bot", botText, botNow);
            pushHistory("assistant", botText);
        } catch (err) {
            const errorText = `Unable to reach AI assistant: ${safeText(err.message, "Unknown error")}`;
            const botNow = formatTime(new Date());
            const updated = readHistory();
            updated.push({ role: "bot", text: errorText, timestamp: botNow });
            writeHistory(updated);
            appendMessage("bot", errorText, botNow);
            // Intentionally NOT pushing the network-error notice into the LLM
            // context so it doesn't leak into the next prompt.
        } finally {
            typing.classList.remove("show");
            sendBtn.disabled = false;
        }
    }

    function renderSuggestions() {
        if (!suggestionsWrap) return;
        suggestionsWrap.innerHTML = "";
        suggestions.forEach((text) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "suggestion-btn";
            btn.textContent = text;
            btn.addEventListener("click", function () {
                chatInput.value = text;
                sendMessageFromText(text);
            });
            suggestionsWrap.appendChild(btn);
        });
        suggestionsWrap.style.display = suggestionsHidden ? "none" : "flex";
    }

    toggle.addEventListener("click", function () {
        panel.classList.toggle("open");
        if (panel.classList.contains("open")) {
            renderQuickActions();
            renderSuggestions();
            chatInput.focus();
        }
    });
    closeBtn.addEventListener("click", function () {
        panel.classList.remove("open");
    });
    clearBtn.addEventListener("click", function () {
        localStorage.removeItem(storageKey);
        conversationHistory.length = 0;
        lastIntentContext = "";
        renderHistory();
        suggestionsHidden = false;
        activeFlow = "";
        flowStep = 0;
        flowRetryCount = 0;
        renderQuickActions();
        renderSuggestions();
    });
    sendBtn.addEventListener("click", sendMessage);
    if (emojiBtn) {
        emojiBtn.addEventListener("click", function () {
            chatInput.focus();
        });
    }
    chatInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            sendMessage();
        }
    });

    renderHistory();
    seedConversationHistoryFromStorage();
    renderQuickActions();
    renderSuggestions();
})();
