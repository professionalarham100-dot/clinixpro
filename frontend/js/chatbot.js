(function () {
    function safeText(value, fallback) {
        if (value === null || value === undefined) return fallback;
        const text = String(value).trim();
        return text ? text : fallback;
    }

    function detectUserType() {
        // Prefer the page the user is actually on — prevents patient replies
        // on the doctor/admin portals if localStorage is stale or mismatched.
        const page = String(window.location.pathname || window.location.href || "").toLowerCase();
        if (page.includes("doctor-dashboard")) return "doctor";
        if (page.includes("patient-dashboard")) return "patient";
        if (
            (page.includes("/dashboard.html") || page.endsWith("dashboard.html")) &&
            !page.includes("doctor") &&
            !page.includes("patient")
        ) return "admin";

        const role = safeText(
            localStorage.getItem("userRole") || localStorage.getItem("userType"),
            ""
        ).toLowerCase();
        if (role === "doctor" || role === "admin" || role === "patient") return role;

        try {
            const ud = JSON.parse(localStorage.getItem("userData") || "{}");
            const fromData = String((ud && (ud.user_type || ud.role || ud.userType)) || "").toLowerCase();
            if (fromData === "doctor" || fromData === "admin" || fromData === "patient") return fromData;
        } catch (_e) {}

        if (
            page.includes("index.html") ||
            page.endsWith("/") ||
            page.includes("login.html") ||
            page.includes("register.html") ||
            page.includes("about.html")
        ) return "visitor";

        return "visitor";
    }

    function currentUserType() {
        return detectUserType();
    }

    function getApiBase() {
        const origin = window.location.origin || "http://localhost:5000";
        try {
            const url = new URL(origin);
            if ((url.hostname === "localhost" || url.hostname === "127.0.0.1") && url.port && url.port !== "5000") {
                return `${url.protocol}//${url.hostname}:5000`;
            }
        } catch (_e) {}
        return origin;
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

    // ── Name memory (survives page refresh within the same user session) ──
    const userNameKey = `clinixpro_user_name_${(function(){return Number(localStorage.getItem("userId")||0)||0;})()||"guest"}`;
    let sessionUserName = "";
    try { sessionUserName = localStorage.getItem(userNameKey) || ""; } catch(_e){}

    // Collapse elongated letter runs so casual/typo input still matches
    // intents: "whatssss" → "whats", "nameeeeee" → "name", "heyyyy" → "hey".
    // A run of the same letter 3+ times is reduced to a single letter; normal
    // double letters ("well", "hello") are left untouched.
    function collapseRepeats(text) {
        return String(text || "").replace(/([a-z])\1{2,}/g, "$1");
    }

    function tryHandleNameLocally(rawText) {
        // Match against BOTH the plain normalized text and an
        // elongation-collapsed version so playful input like
        // "whatssss my nameeeeee" is handled just like "whats my name".
        const normalized = normalizeText(rawText);
        const text = collapseRepeats(normalized);
        // "my name is X" or "call me X" → store and acknowledge.
        // Allow a flexible connector ("is"/"s"/none) after "my name".
        const setMatch = text.match(/\bmy\s+name(?:\s+is|\s*s)?\s+([a-z][a-z\s]{0,28}[a-z]|[a-z])\b/) ||
                         text.match(/\bcall\s+me\s+([a-z][a-z\s]{0,28}[a-z]|[a-z])\b/) ||
                         text.match(/\bi\s+am\s+([a-z][a-z\s]{0,28}[a-z])\b/) ||
                         text.match(/\bi'?m\s+([a-z][a-z\s]{0,28}[a-z])\b/);
        // Guard: don't treat "my name?" / "what is my name" as a set command.
        const isQuestion = /\b(what|whats|who|do|does|know|remember|tell)\b/.test(text);
        if (setMatch && !isQuestion) {
            const raw = setMatch[1].trim();
            const name = raw.split(" ").map(w => w.charAt(0).toUpperCase()+w.slice(1)).join(" ");
            sessionUserName = name;
            try { localStorage.setItem(userNameKey, name); } catch(_e){}
            return `Nice to meet you, ${name}! I'll remember your name for this session. How can I help you today?`;
        }
        // "what's my name", "do you know my name", "whats my name",
        // "tell me my name", or simply "my name?" — all tolerant of typos
        // and elongated spellings via the collapsed text above.
        const asksName =
            /\b(what(?:\s*s|\s+is)?\s+my\s+name)\b/.test(text) ||
            /\b(do\s+you\s+know|know|remember|tell\s+me)\s+my\s+name\b/.test(text) ||
            /^my\s+name\s*$/.test(text) ||
            /\bwho\s+am\s+i\b/.test(text);
        if (asksName) {
            if (sessionUserName) return `Your name is ${sessionUserName}! How can I help you today?`;
            return "I don't know your name yet — tell me by saying 'My name is [name]' and I'll remember it for this session!";
        }
        return null;
    }

    function getLocalFallback(_normalizedText) {
        // Return empty so unmatched queries fall through to Groq.
        // The offline catch block handles the no-Groq case separately.
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
        const role = currentUserType();
        if (intent === "account") return "Next best step: verify credentials, then use password reset if needed. If it still fails, I can generate a support ticket draft.";
        if (intent === "appointment") {
            if (role === "doctor") {
                return "Next, open My Appointments, confirm each patient's time/status, then open the chart for notes or prescriptions.";
            }
            if (role === "admin") {
                return "Next, review the clinic Appointments panel for conflicts, cancellations, and volume trends.";
            }
            return "Next, verify appointment status in history and enable reminders. If no slots appear, try another date or provider.";
        }
        if (intent === "clinical") {
            if (role === "doctor") {
                return "Next, verify diagnosis/prescription fields are complete, save, then reopen the patient chart to confirm details stored.";
            }
            return "Next, verify prescription/record fields are complete, then save and reopen once to confirm details are stored.";
        }
        if (intent === "billing") {
            if (role === "patient") {
                return "Next, open Billing, preview the invoice, pay with Cash/Card/Online, then keep the receipt.";
            }
            if (role === "doctor") {
                return "Next, confirm your consultation fee on Profile; patient invoices are created when appointments are booked.";
            }
            if (role === "admin") {
                return "Next, open Admin → Billing, compare Total Revenue vs Pending Amount, then mark confirmed invoices as Paid.";
            }
            return "Next, open Billing in your dashboard for invoices and payment status.";
        }
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
                keywords: ["clinic hours", "opening hours", "working hours", "open time", "what time", "clinic open", "clinic close", "operation hours"],
                reply:
                    "ClinixPro clinic hours (standard):\n" +
                    "• Monday – Saturday: 9:00 AM – 6:00 PM\n" +
                    "• Sunday: Closed\n\n" +
                    "For the latest schedule, check the clinic footer or contact support@yourdomain.com."
            },
            {
                keywords: ["support", "contact", "helpdesk", "ticket", "whatsapp", "email"],
                reply:
                    "Support options:\n" +
                    "- Open Support/Tickets page for formal issue tracking.\n" +
                    "- Email: support@yourdomain.com\n" +
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
            },
            {
                keywords: ["forgot password", "reset password", "change password", "recover account"],
                reply:
                    "To reset your password:\n" +
                    "1) Open the Login page and choose 'Forgot Password'.\n" +
                    "2) Enter your registered email.\n" +
                    "3) Follow the reset link/instructions sent to you.\n" +
                    "4) Set a strong new password and log in again.\n" +
                    "If no email arrives, check spam or contact support."
            },
            {
                keywords: ["logout", "log out", "sign out", "end session"],
                reply: "To log out, open your profile/account menu in the top bar and select Logout. Always log out on shared or public devices to protect your account."
            },
            {
                keywords: ["notification", "notifications", "alerts", "reminders"],
                reply: "ClinixPro shows in-app notifications for appointments, updates, and messages. Check the notification bell in the top bar. Keep your contact details current so reminders reach you."
            },
            {
                keywords: ["language", "theme", "dark mode", "settings"],
                reply: "Personal preferences such as theme and general settings are available from your dashboard settings/profile area. Adjust them and save; changes apply to your account view."
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

        // ── Health & symptom entries (patient + visitor) ─────────────────
        const healthSymptoms = [
            {
                keywords: ["headache", "head pain", "migraine", "head hurts", "head ache"],
                reply:
                    "For headaches, common first steps:\n" +
                    "• Rest in a quiet, dark room and stay hydrated.\n" +
                    "• Over-the-counter paracetamol or ibuprofen may help.\n" +
                    "• Avoid screens if light sensitivity is present.\n" +
                    "⚠️ Seek immediate care if the headache is sudden and severe, or accompanied by fever, stiff neck, or vision changes.\n\n" +
                    "Would you like to book an appointment with a doctor?"
            },
            {
                keywords: ["fever", "high temperature", "feeling hot", "temperature", "sweating"],
                reply:
                    "For managing fever:\n" +
                    "• Stay hydrated — drink water, juices, or ORS.\n" +
                    "• Rest and avoid exertion.\n" +
                    "• Paracetamol (500mg) every 6 hrs can help reduce temperature.\n" +
                    "⚠️ See a doctor if fever exceeds 39°C (102°F) or lasts more than 2 days.\n\n" +
                    "I can help you book an appointment — just go to your dashboard and click 'Book New Appointment'."
            },
            {
                keywords: ["cough", "cold", "runny nose", "flu", "sneezing", "sore throat", "throat pain"],
                reply:
                    "For cold/flu symptoms:\n" +
                    "• Rest and drink warm fluids (honey+ginger tea helps).\n" +
                    "• Antihistamines or decongestants can ease congestion.\n" +
                    "• Gargle with warm salt water for sore throat.\n" +
                    "⚠️ If symptoms worsen, breathing becomes difficult, or you have a high fever — see a doctor.\n\n" +
                    "Would you like to book an appointment?"
            },
            {
                keywords: ["stomach pain", "stomach ache", "abdominal pain", "nausea", "vomiting", "diarrhea", "loose motion"],
                reply:
                    "For stomach issues:\n" +
                    "• Avoid solid food temporarily; try clear fluids or ORS.\n" +
                    "• Avoid dairy, spicy or fatty foods until symptoms ease.\n" +
                    "• Rest and keep hydrated.\n" +
                    "⚠️ Seek care if pain is severe, persistent (>24hrs), or accompanied by blood.\n\n" +
                    "I recommend booking an appointment for a proper diagnosis."
            },
            {
                keywords: ["chest pain", "chest tightness", "heart pain", "shortness of breath", "breathing difficulty"],
                reply:
                    "⚠️ IMPORTANT: Chest pain or difficulty breathing can be serious.\n" +
                    "Please seek immediate medical attention or call emergency services.\n\n" +
                    "Do not wait — go to the nearest emergency room or call an ambulance if symptoms are severe."
            },
            {
                keywords: ["back pain", "back ache", "lower back", "spine pain"],
                reply:
                    "For back pain:\n" +
                    "• Apply heat or ice to the affected area (20 mins, 3x/day).\n" +
                    "• Gentle stretching and avoiding prolonged sitting helps.\n" +
                    "• Ibuprofen or paracetamol can reduce pain/inflammation.\n" +
                    "⚠️ See a doctor if pain is severe, radiates to legs, or persists beyond a week."
            },
            {
                keywords: ["feeling unwell", "feeling sick", "not feeling well", "general pain", "body ache", "fatigue", "tired", "weakness"],
                reply:
                    "I'm sorry to hear you're not feeling well. Here's what I suggest:\n" +
                    "• Rest and stay hydrated.\n" +
                    "• Monitor your temperature and symptoms.\n" +
                    "• If symptoms persist or worsen, see a doctor promptly.\n\n" +
                    "I can help you book an appointment with a doctor on ClinixPro. Go to your dashboard and click 'Book New Appointment'."
            },
            {
                keywords: ["how many doctors", "available doctors", "doctors available", "which doctors", "doctor list", "how many doctor"],
                reply:
                    "I don't have live doctor availability data right now.\n\n" +
                    "Please open your patient dashboard and use 'Book New Appointment' to see current available doctors."
            },
            {
                keywords: ["blood pressure", "bp", "hypertension", "high blood pressure", "low blood pressure"],
                reply:
                    "Blood pressure tips:\n" +
                    "• Normal range: 90/60 – 120/80 mmHg.\n" +
                    "• For high BP: reduce salt, exercise regularly, avoid stress.\n" +
                    "• For low BP: increase fluid intake, avoid sudden position changes.\n" +
                    "⚠️ Always follow your doctor's prescribed medication and check-up schedule.\n\n" +
                    "Book a check-up via your patient dashboard."
            },
            {
                keywords: ["diabetes", "blood sugar", "sugar level", "insulin"],
                reply:
                    "Diabetes management tips:\n" +
                    "• Monitor blood sugar regularly as advised by your doctor.\n" +
                    "• Follow a low-sugar, balanced diet.\n" +
                    "• Exercise regularly and maintain a healthy weight.\n" +
                    "• Take medications/insulin as prescribed — never skip doses.\n" +
                    "⚠️ Always consult your doctor for dosage adjustments."
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
            },
            {
                keywords: ["cancel appointment", "reschedule", "change appointment", "cancel booking"],
                reply:
                    "To cancel or reschedule an appointment:\n" +
                    "1) Open your dashboard appointments/history section.\n" +
                    "2) Find the appointment you want to change.\n" +
                    "3) Use the cancel or reschedule option and confirm.\n" +
                    "Please make changes early so your doctor's slot can be reused."
            },
            {
                keywords: ["medical record", "my records", "test results", "reports", "history"],
                reply: "Your medical records, visit history, and shared test results appear in the Records section of your patient dashboard. Open an entry to view details, and contact your clinic if something looks missing."
            },
            {
                keywords: ["bill", "invoice", "payment", "pay online", "my bill"],
                reply: "Your invoices and payment status are shown in the Billing section of your dashboard. Review the amount and status, and follow the listed payment/verification steps. Keep proof of payment for your records."
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
            },
            {
                keywords: [
                    "today appointments", "view appointments", "appointment list", "upcoming patients",
                    "my appointment", "appointment with patient", "when is my appointment",
                    "schedule today", "my schedule", "upcoming appointment"
                ],
                reply:
                    "To review your appointments with patients:\n" +
                    "1) Open Doctor Dashboard → My Appointments.\n" +
                    "2) Switch between Today and All to see upcoming visits.\n" +
                    "3) Open a patient to view records, create a clinical note, or write a prescription.\n" +
                    "Ask me “What are my appointments today?” for a live schedule summary."
            },
            {
                keywords: ["book appointment", "schedule visit", "new booking"],
                reply:
                    "Patients book visits from their own dashboard. As a doctor, you manage those bookings in My Appointments — you do not book like a patient.\n" +
                    "Open My Appointments to see who is scheduled with you, then open the patient chart as needed."
            },
            {
                keywords: ["view patient", "patient list", "assigned patients", "my patients"],
                reply: "Your assigned patients appear via your appointments and the Records section. Open a patient from your appointment list to view their history, add notes, or create a prescription."
            },
            {
                keywords: ["update photo", "profile photo", "profile picture", "change photo"],
                reply: "To update your profile photo, open your dashboard profile section and use the upload photo option. You can also remove the current photo to fall back to your initials avatar."
            }
        ];

        const admin = [
            {
                keywords: ["user management", "add doctor", "staff", "roles", "permissions", "approve doctor", "pending doctor"],
                reply:
                    "Admin user management:\n" +
                    "1) Open Admin Dashboard → Doctors / Patients.\n" +
                    "2) Approve pending doctor applications from Pending Reviews.\n" +
                    "3) Deactivate stale accounts from the user tables.\n" +
                    "Ask “How many doctors are pending?” for live counts."
            },
            {
                keywords: ["track billing", "mark paid", "billing status", "invoice status", "reconcile"],
                reply:
                    "Admin billing:\n" +
                    "1) Open Admin → Billing.\n" +
                    "2) Use Total Revenue / Pending Amount cards for overview.\n" +
                    "3) Mark invoices Paid when payment is confirmed.\n" +
                    "Ask “How much revenue is generated?” for live totals from the database."
            },
            {
                keywords: ["report", "dashboard metrics", "analytics", "kpi", "what should i monitor"],
                reply:
                    "Monitor these admin KPIs first:\n" +
                    "1) Appointment volume & no-shows (Appointments).\n" +
                    "2) Revenue collected vs pending bills (Billing).\n" +
                    "3) Pending doctor applications (Dashboard).\n" +
                    "4) Open support tickets.\n" +
                    "Ask me for live revenue or pending bills anytime."
            }
        ];

        if (currentUserType === "patient") return common.concat(healthSymptoms, patient);
        if (currentUserType === "doctor") return common.concat(healthSymptoms, doctor);
        if (currentUserType === "admin") return common.concat(admin);
        return common.concat(healthSymptoms, visitor);
    }

    // Patterns that are clearly personal/general conversation and must NEVER
    // be handled locally. Anything matching here goes straight to Groq so the
    // conversation history is used to give a contextual answer.
    // NOTE: `text` is already normalized (lowercased, punctuation replaced
    // with spaces, whitespace collapsed). So "What's my name?" arrives as
    // "what s my name".
    function isPersonalConversation(text) {
        if (!text) return false;
        // Collapse elongated spellings first so "my nameeeee" is still caught.
        const t = collapseRepeats(text);
        // Anything mentioning "my name" — handles "my name is X",
        // "what's my name", "do you know/remember my name", etc.
        if (/\bmy\s+name\b/.test(t)) return true;
        // Asking the bot to remember something about the user.
        if (/\bremember\s+me\b/.test(t)) return true;
        if (/\bcall\s+me\b/.test(t)) return true;
        if (/\bwho\s+am\s+i\b/.test(t)) return true;
        return false;
    }

    function getLocalReply(message) {
        const guidedReply = getGuidedFlowReply(message);
        if (guidedReply) return guidedReply;

        const text = normalizeText(message);
        if (!text) return "";

        // Live clinic data must reach the API (role-aware numbers).
        if (isLiveDataQuery(text)) {
            lastIntentContext = detectGeneralIntent(text) || lastIntentContext;
            return "";
        }

        // Greetings: clear any leftover intent context from a previous chat
        // turn and let Groq generate a contextual welcome. Without this,
        // typing "hello" after a login-troubleshooting flow replays the
        // stale "Next best step: verify credentials..." message.
        if (isGreeting(text)) {
            lastIntentContext = "";
            return "";
        }

        // Name memory: handle locally before sending to Groq.
        const nameReply = tryHandleNameLocally(message);
        if (nameReply !== null) return nameReply;

        // Other personal/general talk — let Groq handle with conversation history.
        if (isPersonalConversation(text)) return "";

        const textTokens = getTextTokens(text);
        const detectedIntent = detectGeneralIntent(text);

        if (isFollowUpMessage(text) && !detectedIntent && lastIntentContext) {
            const contextual = getContextualFollowUp(lastIntentContext);
            if (contextual) return contextual;
        }

        const knowledgeBase = buildKnowledgeBase(currentUserType());
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
    const CHAT_MIGRATION_VERSION = "2026-07-role-data-clio-v2";
    try {
        if (localStorage.getItem(CHAT_MIGRATION_KEY) !== CHAT_MIGRATION_VERSION) {
            Object.keys(localStorage).forEach((key) => {
                if (key.startsWith("clinixpro_chat_history_")) {
                    localStorage.removeItem(key);
                }
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
            "What are my appointments today?",
            "Who are my patients?",
            "How do I create a prescription?",
            "How do I complete a patient record?"
        ];
    } else if (pagePath.includes("dashboard.html")) {
        suggestions = [
            "How much revenue is generated?",
            "How much is pending in bills?",
            "How many appointments today?",
            "How do I approve pending doctors?"
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

    function isLiveDataQuery(text) {
        // Questions that must hit the backend for real clinic numbers / lists.
        // Never answer these with canned local "how-to" scripts.
        const t = collapseRepeats(normalizeText(text));
        if (!t) return false;
        return (
            /\b(how much|revenue|generated|collected|earnings|income|total (paid|revenue)|money)\b/.test(t) ||
            /\b(pending (amount|bill|payment|invoice)|unpaid|outstanding)\b/.test(t) ||
            /\b(clinic (stat|overview|metric)|kpi|how many (patient|doctor|appointment|bill))\b/.test(t) ||
            /\b(my (patient|patients|schedule|appointment|appointments)|appointments today|today'?s appointment)\b/.test(t) ||
            /\b(available doctor|which doctor|doctor list|consultation fee)\b/.test(t) ||
            /\b(pending doctor|doctor application)\b/.test(t)
        );
    }

    function detectFlowIntent(text) {
        // Data questions are never troubleshooting flows.
        if (isLiveDataQuery(text)) return "";
        if (/\b(login|sign in|password|cannot login|cant login|forgot)\b/.test(text)) return "login";
        if (/\b(book|booking|appointment|schedule|slot)\b/.test(text)) return "booking";
        if (/\b(prescription|medicine|medication|rx)\b/.test(text)) return "prescription";
        // Keep "revenue" out — that is a live admin stats question.
        if (/\b(billing|invoice|payment|charges|pay now|mark paid)\b/.test(text)) return "billing";
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
        const role = currentUserType();

        // Live data (revenue, schedules, patients…) always goes to the API.
        if (!activeFlow && isLiveDataQuery(text)) return "";

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
                if (role === "doctor") {
                    return (
                        "Doctor appointment flow:\n" +
                        "1) Doctor Dashboard → My Appointments\n" +
                        "2) Review today / upcoming visits with patients\n" +
                        "3) Open a patient to view records or write a prescription\n" +
                        "Ask “What are my appointments today?” for a live list.\n" +
                        "Did this help? Reply yes/no."
                    );
                }
                if (role === "admin") {
                    return (
                        "Admin appointments flow:\n" +
                        "1) Admin Dashboard → Appointments\n" +
                        "2) Monitor clinic-wide bookings and statuses\n" +
                        "3) Check conflicts, cancellations, and volume\n" +
                        "Ask “How many appointments today?” for live counts.\n" +
                        "Did this help? Reply yes/no."
                    );
                }
                return (
                    "Appointment booking flow:\n" +
                    "1) Dashboard -> Appointments -> Book Appointment\n" +
                    "2) Select doctor, date, and slot\n" +
                    "3) Confirm and verify status in history\n" +
                    "Did this work? Reply yes/no."
                );
            }
            if (intent === "prescription") {
                if (role === "doctor") {
                    return (
                        "Doctor prescription flow:\n" +
                        "1) Open the patient from My Patients or Appointments\n" +
                        "2) Choose Write Prescription\n" +
                        "3) Add medicine, dose, frequency, duration, and save\n" +
                        "Did this solve your issue? Reply yes/no."
                    );
                }
                if (role === "admin") {
                    return (
                        "Admins can monitor prescription activity from clinic reports, " +
                        "but prescriptions are created by doctors in the patient chart.\n" +
                        "Did this help? Reply yes/no."
                    );
                }
                return (
                    "Prescription flow:\n" +
                    "- Patient: Dashboard -> Prescriptions\n" +
                    "- Doctor: Patient record -> Prescription module -> Save\n" +
                    "Did this solve your issue? Reply yes/no."
                );
            }
            if (intent === "billing") {
                if (role === "doctor") {
                    return (
                        "Doctor billing tip:\n" +
                        "Consultation fees are set on your Profile. Patient invoices are generated when appointments are booked.\n" +
                        "Patients pay from their Billing section. Admins reconcile clinic-wide billing.\n" +
                        "Still facing an issue? Reply yes/no."
                    );
                }
                if (role === "patient") {
                    return (
                        "Billing flow:\n" +
                        "1) Open Billing in your patient dashboard\n" +
                        "2) Preview or Pay Now on a pending invoice\n" +
                        "3) Choose Cash, Card, or Online and confirm\n" +
                        "4) Open the receipt for payment details\n" +
                        "Still facing an issue? Reply yes/no."
                    );
                }
                if (role === "admin") {
                    return (
                        "Admin billing flow:\n" +
                        "1) Open Admin → Billing\n" +
                        "2) Review Total Revenue vs Pending Amount cards\n" +
                        "3) Mark pending invoices as Paid when payment is confirmed\n" +
                        "Ask “How much revenue is generated?” for live totals.\n" +
                        "Still facing an issue? Reply yes/no."
                    );
                }
                return (
                    "Billing help depends on your role. Open Billing in your dashboard, " +
                    "or ask about revenue / pending bills for live numbers.\n" +
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
                { label: "Today's Schedule", prompt: "What are my appointments today?" },
                { label: "My Patients", prompt: "Who are my patients?" },
                { label: "Open Appointments", action: "navigate", target: { page: "doctor-dashboard.html", section: "appointments" }, prompt: "How do I view today's appointments?" },
                { label: "Create Rx", action: "navigate", target: { page: "doctor-dashboard.html", section: "prescriptions" }, prompt: "How do I create a prescription?" },
                { label: "Create Ticket", action: "open-ticket-form" }
            ];
        }
        if (currentUserType === "admin") {
            return [
                { label: "Revenue Now", prompt: "How much revenue is generated?" },
                { label: "Pending Bills", prompt: "How much is pending in bills?" },
                { label: "Open Billing", action: "navigate", target: { page: "dashboard.html", section: "billing" }, prompt: "How do I track billing status?" },
                { label: "Pending Doctors", action: "navigate", target: { page: "dashboard.html", section: "dashboard" }, prompt: "How do I approve pending doctors?" },
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

    // ── Live doctor availability from backend ─────────────────────────
    function isDoctorAvailabilityQuery(text) {
        const t = normalizeText(text);
        // Match any message containing both "doctor" (or "dr") and
        // availability-related words, in any order.
        const hasDoctor = /\b(doctor|doctors|dr)\b/.test(t);
        const hasAvail  = /\b(available|availability|rightnow|right now|online|free|open|who|which|list|show|see|any|how many|current)\b/.test(t);
        if (hasDoctor && hasAvail) return true;
        // Also catch standalone "available doctor" style phrases
        return /\b(available\s+doctor|doctor\s+available|which\s+doctor|how\s+many\s+doctor|doctor\s+list|show\s+doctor|see\s+a\s+doctor|doctors\s+available|who\s+is\s+available|who\s+can\s+i\s+see)\b/.test(t);
    }

    async function fetchAndShowDoctors() {
        const token = localStorage.getItem("token") || "";
        let doctors = [];
        try {
            const headers = { "Content-Type": "application/json" };
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const res = await fetch(`${API_BASE}/api/doctors`, { headers });
            if (res.ok) {
                const raw = await res.json();
                doctors = Array.isArray(raw) ? raw : [];
            }
        } catch (_e) { /* network error — fall through to fallback */ }

        let reply = "";
        if (doctors.length === 0) {
            reply = "I couldn't fetch live doctor data right now.\n\nYou can view available doctors directly in your dashboard under 'Book New Appointment'.";
        } else {
            const available = doctors.filter(d =>
                String(d.status || "active").toLowerCase() !== "inactive" &&
                d.is_available !== false
            );
            if (available.length === 0) {
                reply = "No doctors are currently marked as available. Please check back soon or contact the clinic.";
            } else {
                const lines = available.map(d => {
                    const name = d.name || "Unknown Doctor";
                    const spec = d.specialty || d.specialization || d.department || "General";
                    const fee  = d.consultation_fee ? ` — Fee: Rs. ${d.consultation_fee}` : "";
                    return `• ${name} (${spec})${fee}`;
                });
                reply =
                    `✅ ${available.length} doctor${available.length > 1 ? "s are" : " is"} currently available:\n\n` +
                    lines.join("\n") +
                    "\n\nClick the button below to book an appointment right now!";
            }
        }

        const botNow = formatTime(new Date());
        const updated = readHistory();
        updated.push({ role: "bot", text: reply, timestamp: botNow });
        writeHistory(updated);
        appendMessage("bot", reply, botNow);
        pushHistory("assistant", reply);

        // Show a direct "Book Appointment" action button
        const bookBtn = document.createElement("button");
        bookBtn.type = "button";
        bookBtn.textContent = "⚡ Book Appointment Now";
        bookBtn.style.cssText = "margin:6px 0 4px 0;padding:8px 16px;background:#0f766e;color:#fff;border:none;border-radius:20px;font-size:0.85rem;font-weight:600;cursor:pointer;";
        bookBtn.addEventListener("click", () => openShortcut({ page: "patient-dashboard.html", section: "appointments" }));
        chatBody.appendChild(bookBtn);
        chatBody.scrollTop = chatBody.scrollHeight;

        return true;
    }

    function renderQuickActions() {
        if (!quickActionsWrap) return;
        quickActionsWrap.innerHTML = "";
        const actions = getQuickActionsForRole(currentUserType());
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
                    // Keep the user inside the chat: answer the related question
                    // as text instead of navigating away from the page.
                    const q = action.prompt || action.label;
                    chatInput.value = q;
                    chatInput.focus();
                    sendMessageFromText(q);
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
            const disclaimer = getDisclaimer(currentUserType());
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
        const activeRole = currentUserType();
        try {
            // ── Live doctor availability: patients only ──
            if (activeRole === "patient" && isDoctorAvailabilityQuery(message)) {
                await fetchAndShowDoctors();
                typing.classList.remove("show");
                sendBtn.disabled = false;
                return;
            }

            const localReply = getLocalReply(message);
            // Debug aid: log whether the local handler matched. An empty string
            // means the message will be sent to Groq with conversation history.
            console.log("[chatbot] role=", activeRole, "Local reply:", localReply ? localReply.slice(0, 80) + (localReply.length > 80 ? "…" : "") : "(none — sending to Groq)");
            if (localReply) {
                const lastBotText = getLastBotMessage();
                // If same answer would repeat, fall through to Groq for a
                // richer, context-aware follow-up instead of a confusing message.
                if (lastBotText === localReply) {
                    // intentional fall-through to Groq below
                } else {
                    const botNowLocal = formatTime(new Date());
                    const updatedLocal = readHistory();
                    updatedLocal.push({ role: "bot", text: localReply, timestamp: botNowLocal });
                    writeHistory(updatedLocal);
                    appendMessage("bot", localReply, botNowLocal);
                    pushHistory("assistant", localReply);
                    return;
                }
            }

            const token = localStorage.getItem("token") || "";
            const headers = { "Content-Type": "application/json" };
            if (token) headers.Authorization = `Bearer ${token}`;
            const res = await fetch(`${API_BASE}/api/chat`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    message,
                    user_type: activeRole,
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
            console.error("Unable to reach AI assistant:", err);
            // Network / Groq failure — try the local knowledge base one more
            // time before showing the offline banner. The first getLocalReply()
            // call (above) skips greetings & personal-conversation so they can
            // reach Groq; on network failure we want ANY useful reply.
            // For offline fallback, bypass the Groq-only guards so greetings
            // and personal messages also get a useful local answer.
            let offlineLocal = getLocalReply(message);
            if (!offlineLocal) {
                const nameReplyOffline = tryHandleNameLocally(message);
                if (nameReplyOffline !== null) offlineLocal = nameReplyOffline;
            }
            if (!offlineLocal && isGreeting(normalizeText(message))) {
                offlineLocal = getDisclaimer(activeRole);
            }
            const name = sessionUserName ? `, ${sessionUserName}` : "";
            const roleHelp = {
                doctor: "appointments with your patients, prescriptions, medical records, and schedule settings",
                admin: "users, appointments, billing, and clinic analytics",
                patient: "booking appointments, prescriptions, medical records, billing, and health questions",
                visitor: "login, registration, and ClinixPro features"
            };
            const errorText = offlineLocal ||
                `Hi${name}! I'm Clio, your ClinixPro AI Health Assistant. I can help with ${roleHelp[activeRole] || roleHelp.visitor}. What would you like help with?`;
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
        localStorage.removeItem(userNameKey);
        sessionUserName = "";
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
