// ==================== API CONFIGURATION ====================
function getBackendOrigin() {
    const origin = window.location.origin || 'http://localhost:5000';
    try {
        const url = new URL(origin);
        if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.port && url.port !== '5000') {
            return `${url.protocol}//${url.hostname}:5000`;
        }
    } catch (_e) {}
    return origin;
}

const API_BASE_URL = `${getBackendOrigin()}/api`;

// ==================== VALIDATION UTILITIES ====================
function showValidationError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.style.borderColor = '#f44336';
        field.style.boxShadow = '0 0 0 3px rgba(244, 67, 54, 0.1)';
        const error = document.createElement('div');
        error.className = 'cp-inline-error';
        error.style.cssText = 'color:#f44336;font-size:0.85rem;margin-top:0.25rem;';
        error.textContent = message;
        const parent = field.parentElement;
        if (parent) {
            parent.querySelectorAll('.cp-inline-error').forEach((el) => el.remove());
            parent.appendChild(error);
        }
    }
}

function clearValidationErrors() {
    document.querySelectorAll('input, textarea, select').forEach(field => {
        field.style.borderColor = '';
        field.style.boxShadow = '';
    });
    document.querySelectorAll('.cp-inline-error').forEach((el) => el.remove());
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validatePassword(password) {
    return password && password.length >= 6;
}

// ==================== LOGIN FORM HANDLER ====================
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearValidationErrors();
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const submitLabel = submitBtn ? submitBtn.innerHTML : '';
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value.trim();
        const rememberMe = document.getElementById('remember').checked;

        // Validation
        let isValid = true;
        if (!email) {
            showValidationError('email', 'Email is required');
            isValid = false;
        } else if (!validateEmail(email)) {
            showValidationError('email', 'Please enter a valid email address');
            isValid = false;
        }

        if (!password) {
            showValidationError('password', 'Password is required');
            isValid = false;
        } else if (!validatePassword(password)) {
            showValidationError('password', 'Password must be at least 6 characters');
            isValid = false;
        }

        if (!isValid) {
            const firstInvalid = loginForm.querySelector('input[style*="244, 67, 54"]');
            if (firstInvalid) firstInvalid.focus();
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
        }

        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                // Wipe ALL avatar/photo keys from every previous session so no
                // photo from any prior account can bleed into the new login.
                try {
                    const keysToRemove = Object.keys(localStorage).filter(
                        k => k.startsWith('patientAvatarDataUrl') || k.startsWith('doctorAvatarDataUrl') || k.startsWith('clinixpro_user_name_')
                    );
                    keysToRemove.forEach(k => localStorage.removeItem(k));
                } catch (_e) {}
                // Store token
                localStorage.setItem('token', data.token);
                localStorage.setItem('userType', data.user_type);
                localStorage.setItem('userId', data.user_id);
                localStorage.setItem('userName', data.name);
                localStorage.setItem('userEmail', email.toLowerCase());
                
                if (rememberMe) {
                    localStorage.setItem('rememberedEmail', email);
                }

                // Redirect based on user type
                if (data.user_type === 'doctor') {
                    if (data.doctor_profile_complete === false) {
                        window.location.href = 'doctor-profile-complete.html';
                    } else {
                        window.location.href = 'doctor-dashboard.html';
                    }
                } else if (data.user_type === 'patient') {
                    window.location.href = 'patient-dashboard.html';
                } else {
                    window.location.href = 'dashboard.html';
                }
            } else if (data.application_status === 'pending' || data.application_status === 'rejected') {
                // Doctor whose application is not yet approved — route to the
                // in-app status page instead of showing a bare error.
                try {
                    sessionStorage.setItem('doctorApplicationStatus', JSON.stringify({
                        status: data.application_status,
                        rejection_reason: data.rejection_reason || '',
                        application: data.doctor_application || {},
                        // Keep the just-entered password ONLY for rejected applicants
                        // so they can re-apply without retyping it.
                        password: data.application_status === 'rejected' ? password : ''
                    }));
                } catch (_e) {}
                window.location.href = 'doctor-status.html';
            } else {
                showValidationError('email', data.error || 'Login failed. Please check your credentials.');
            }
        } catch (error) {
            console.error('Error:', error);
            let errorMessage = 'Network error. Please try again.';
            
            if (!error.message) {
                errorMessage = 'Cannot connect to the server. Please ensure the server is running.';
            } else if (error.message === 'Failed to fetch') {
                errorMessage = 'Cannot connect to server. Is the backend running?';
            } else {
                errorMessage = `Error: ${error.message}`;
            }
            
            showValidationError('email', errorMessage);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = submitLabel;
            }
        }
    });

    // Auto-fill remembered email
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail) {
        document.getElementById('email').value = rememberedEmail;
        document.getElementById('remember').checked = true;
    }
}

// ==================== REGISTER FORM HANDLER ====================
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');
    const emailInput = document.getElementById('regEmail');
    const phoneInput = document.getElementById('phone');
    const passwordInput = document.getElementById('regPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const userTypeInput = document.getElementById('userType');
    const feedbackBox = document.getElementById('registerFeedback');

    // Names: 2–20 chars, letters plus spaces/hyphens/apostrophes/periods.
    // Prevents unbounded "essay" input that could break layout/storage.
    const NAME_PATTERN = /^[A-Za-z][A-Za-z .'-]{0,19}$/;
    const registerValidators = {
        firstName: {
            test: (value) => NAME_PATTERN.test(value.trim()) && value.trim().length >= 2,
            message: 'First name: 2–20 letters (spaces, - . \' allowed).'
        },
        lastName: {
            test: (value) => NAME_PATTERN.test(value.trim()) && value.trim().length >= 2,
            message: 'Last name: 2–20 letters (spaces, - . \' allowed).'
        },
        regEmail: {
            test: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),
            message: 'Enter a valid email (must include @ and .).'
        },
        phone: {
            test: (value) => /^03\d{9}$/.test(value.trim()),
            message: 'Phone must be 11 digits and start with 03.'
        },
        regPassword: {
            test: (value) => String(value).length >= 6,
            message: 'Password must be at least 6 characters.'
        },
        confirmPassword: {
            test: (value) => value === passwordInput.value,
            message: 'Passwords do not match.'
        }
    };

    function setInlineError(fieldId, message) {
        const field = document.getElementById(fieldId);
        const errorEl = document.getElementById(`${fieldId}Error`);
        if (field) field.classList.add('field-error');
        if (errorEl) errorEl.textContent = message || '';
    }

    function clearInlineError(fieldId) {
        const field = document.getElementById(fieldId);
        const errorEl = document.getElementById(`${fieldId}Error`);
        if (field) field.classList.remove('field-error');
        if (errorEl) errorEl.textContent = '';
    }

    function clearRegisterFeedback() {
        if (!feedbackBox) return;
        feedbackBox.textContent = '';
        feedbackBox.classList.remove('show');
    }

    function showRegisterFeedback(message) {
        if (!feedbackBox) return;
        feedbackBox.textContent = message;
        feedbackBox.classList.add('show');
    }

    function validateRegisterField(fieldId) {
        const validator = registerValidators[fieldId];
        if (!validator) return true;
        const value = document.getElementById(fieldId).value;
        if (!validator.test(value)) {
            setInlineError(fieldId, validator.message);
            return false;
        }
        clearInlineError(fieldId);
        return true;
    }

    [firstNameInput, lastNameInput, emailInput, phoneInput, passwordInput, confirmPasswordInput].forEach((inputEl) => {
        if (!inputEl) return;
        inputEl.addEventListener('input', () => {
            clearRegisterFeedback();
            validateRegisterField(inputEl.id);
            if (inputEl.id === 'regPassword' && confirmPasswordInput.value) {
                validateRegisterField('confirmPassword');
            }
        });
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearRegisterFeedback();
        const submitBtn = registerForm.querySelector('button[type="submit"]');
        const submitLabel = submitBtn ? submitBtn.innerHTML : '';

        const firstName = firstNameInput.value.trim();
        const lastName = lastNameInput.value.trim();
        const email = emailInput.value.trim();
        const phone = phoneInput.value.trim();
        const password = passwordInput.value;
        const userType = userTypeInput.value;

        const firstNameOk = validateRegisterField('firstName');
        const lastNameOk = validateRegisterField('lastName');
        const emailOk = validateRegisterField('regEmail');
        const phoneOk = validateRegisterField('phone');
        const passwordOk = validateRegisterField('regPassword');
        const confirmOk = validateRegisterField('confirmPassword');
        if (!firstName || !lastName || !userType) {
            showRegisterFeedback('Please fill all required fields.');
            if (!firstName) firstNameInput.focus();
            else if (!lastName) lastNameInput.focus();
            else userTypeInput.focus();
            return;
        }
        if (!(firstNameOk && lastNameOk && emailOk && phoneOk && passwordOk && confirmOk)) {
            showRegisterFeedback('Please correct the highlighted fields.');
            const firstInvalid = registerForm.querySelector('.field-error');
            if (firstInvalid) firstInvalid.focus();
            return;
        }

        if (userType === 'doctor') {
            sessionStorage.setItem('doctorRegistrationBasic', JSON.stringify({
                first_name: firstName,
                last_name: lastName,
                email: email,
                phone: phone,
                password: password
            }));
            window.location.href = 'register-doctor.html';
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
        }

        try {
            const response = await fetch(`${API_BASE_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    first_name: firstName,
                    last_name: lastName,
                    email,
                    phone,
                    password,
                    user_type: userType
                })
            });

            const data = await response.json();

            if (response.ok) {
                openVerifyModal({
                    email: data.email || email,
                    fullName: `${firstName} ${lastName}`.trim(),
                    debugCode: data.debug_code,
                    note: data.note
                });
            } else {
                const backendError = data.error || 'Registration failed. Please try again.';
                showRegisterFeedback(backendError);
                if (backendError === 'This email is already registered. Please login.') {
                    setInlineError('regEmail', backendError);
                }
                if (backendError === 'This phone number is already registered.') {
                    setInlineError('phone', backendError);
                }
            }
        } catch (error) {
            console.error('Error:', error);
            showRegisterFeedback('Unable to connect to the server. Please try again.');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = submitLabel;
            }
        }
    });

    // ==================== VERIFICATION MODAL ====================
    const verifyModal = document.getElementById('verifyModal');
    if (verifyModal) {
        const verifyForm = document.getElementById('verifyForm');
        const rvCode = document.getElementById('rvCode');
        const rvMsg = document.getElementById('rvMsg');
        const rvVerifyBtn = document.getElementById('rvVerifyBtn');
        const rvResendBtn = document.getElementById('rvResendBtn');
        const rvEmailDisplay = document.getElementById('rvEmailDisplay');
        const rvWelcomeText = document.getElementById('rvWelcomeText');
        const rvGoLoginBtn = document.getElementById('rvGoLoginBtn');
        let rvCurrentEmail = '';
        let rvCurrentName = '';

        function rvSetMsg(text, type) {
            rvMsg.textContent = text || '';
            rvMsg.className = 'rv-msg' + (type ? ' ' + type : '');
        }

        function rvSetLoading(btn, isLoading) {
            btn.disabled = !!isLoading;
            btn.classList.toggle('loading', !!isLoading);
        }

        function rvShowStep(step) {
            verifyModal.querySelectorAll('.rv-step').forEach((el) => {
                el.hidden = String(el.dataset.rvStep) !== String(step);
            });
        }

        window.openVerifyModal = function ({ email, fullName, debugCode, note }) {
            rvCurrentEmail = email;
            rvCurrentName = fullName;
            rvEmailDisplay.textContent = email;
            rvCode.value = '';
            rvSetMsg('', '');
            rvShowStep(1);
            verifyModal.classList.add('show');
            verifyModal.setAttribute('aria-hidden', 'false');
            if (debugCode) {
                rvSetMsg(`Dev mode: code is ${debugCode}`, 'info');
            } else if (note) {
                rvSetMsg(note, 'info');
            } else {
                rvSetMsg('Code sent. Check your inbox (and spam folder).', 'success');
            }
            setTimeout(() => rvCode.focus(), 80);
        };

        function closeVerifyModal() {
            verifyModal.classList.remove('show');
            verifyModal.setAttribute('aria-hidden', 'true');
        }

        verifyModal.querySelectorAll('[data-rv-close]').forEach((el) => {
            el.addEventListener('click', closeVerifyModal);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && verifyModal.classList.contains('show')) {
                closeVerifyModal();
            }
        });

        verifyForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            rvSetMsg('', '');
            const code = (rvCode.value || '').trim();
            if (!/^\d{6}$/.test(code)) {
                rvSetMsg('Enter the 6-digit code from your email.', 'error');
                return;
            }
            rvSetLoading(rvVerifyBtn, true);
            try {
                const response = await fetch(`${API_BASE_URL}/auth/verify-registration`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: rvCurrentEmail, code })
                });
                let data = {};
                try { data = await response.json(); } catch (_err) { data = {}; }
                if (!response.ok) {
                    throw new Error(data.error || 'Verification failed.');
                }
                const niceName = data.name || rvCurrentName || 'there';
                rvWelcomeText.textContent = `Hi ${niceName}, your account is now active. Sign in to start using ClinixPro.`;
                rvShowStep(2);
                localStorage.setItem(
                    'registerSuccessMessage',
                    `Welcome to ClinixPro, ${niceName}! Your account has been verified — please sign in.`
                );
                localStorage.setItem('rememberedEmail', rvCurrentEmail);
            } catch (err) {
                rvSetMsg(err.message || 'Could not verify code. Please try again.', 'error');
            } finally {
                rvSetLoading(rvVerifyBtn, false);
            }
        });

        rvResendBtn.addEventListener('click', async () => {
            if (!rvCurrentEmail) return;
            rvSetMsg('', '');
            rvSetLoading(rvResendBtn, true);
            try {
                const response = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: rvCurrentEmail })
                });
                let data = {};
                try { data = await response.json(); } catch (_err) { data = {}; }
                if (!response.ok) {
                    throw new Error(data.error || 'Could not resend code.');
                }
                if (data.debug_code) {
                    rvSetMsg(`Dev mode: new code is ${data.debug_code}`, 'info');
                } else {
                    rvSetMsg('A new verification code has been sent to your email.', 'success');
                }
            } catch (err) {
                rvSetMsg(err.message || 'Resend failed. Please try again.', 'error');
            } finally {
                rvSetLoading(rvResendBtn, false);
            }
        });

        rvGoLoginBtn.addEventListener('click', () => {
            window.location.href = 'login.html';
        });
    }
}

// ==================== DOCTOR VERIFICATION FORM HANDLER ====================
const doctorRegisterForm = document.getElementById('doctorRegisterForm');
if (doctorRegisterForm) {
    const feedbackEl = document.getElementById('doctorRegisterFeedback');
    const pendingEl = document.getElementById('doctorPendingMessage');
    const specializationInput = document.getElementById('specialization');

    const clearFeedback = () => {
        if (feedbackEl) {
            feedbackEl.textContent = '';
            feedbackEl.classList.remove('show');
        }
    };
    const showFeedback = (msg) => {
        if (feedbackEl) {
            feedbackEl.textContent = msg;
            feedbackEl.classList.add('show');
        }
    };
    const showPending = (msg) => {
        if (pendingEl) {
            pendingEl.textContent = msg;
            pendingEl.classList.add('show');
        }
    };

    const baseDataRaw = sessionStorage.getItem('doctorRegistrationBasic');
    let baseData = null;
    try {
        baseData = baseDataRaw ? JSON.parse(baseDataRaw) : null;
    } catch (e) {
        baseData = null;
    }
    if (!baseData || !baseData.email || !baseData.password) {
        window.location.href = 'register.html';
    }

    // Pre-fill fields for a rejected doctor re-applying (document must be fresh).
    try {
        const prefillRaw = sessionStorage.getItem('doctorReapplyPrefill');
        if (prefillRaw) {
            const prefill = JSON.parse(prefillRaw);
            const setVal = (id, val) => {
                const el = document.getElementById(id);
                if (el && val != null && String(val) !== '') el.value = val;
            };
            setVal('specialization', prefill.specialization);
            setVal('clinicName', prefill.clinic_name);
            setVal('city', prefill.city);
            setVal('experienceYears', prefill.experience_years);
            setVal('doctorBio', prefill.bio);
            sessionStorage.removeItem('doctorReapplyPrefill');
        }
    } catch (_e) {}

    // Document upload + disclaimer gating.
    const documentInput = document.getElementById('verificationDocument');
    const disclaimerCheckbox = document.getElementById('disclaimerCheckbox');
    const submitButton = doctorRegisterForm.querySelector('button[type="submit"]');
    const MAX_DOC_BYTES = 5 * 1024 * 1024; // 5MB
    const ALLOWED_DOC_EXT = ['pdf', 'jpg', 'jpeg', 'png'];

    // Enable the submit button only once the disclaimer is acknowledged.
    const syncSubmitState = () => {
        if (submitButton) submitButton.disabled = !(disclaimerCheckbox && disclaimerCheckbox.checked);
    };
    if (disclaimerCheckbox) {
        disclaimerCheckbox.addEventListener('change', syncSubmitState);
        syncSubmitState();
    }

    const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read the document file.'));
        reader.readAsDataURL(file);
    });

    doctorRegisterForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFeedback();
        const submitBtn = submitButton;
        const submitLabel = submitBtn ? submitBtn.innerHTML : '';

        const medicalLicenseNumber = document.getElementById('medicalLicenseNumber').value.trim();
        const specialization = specializationInput.value.trim();
        const clinicName = document.getElementById('clinicName').value.trim();
        const experienceYears = Number(document.getElementById('experienceYears').value || 0);
        const city = document.getElementById('city').value.trim();
        const bio = document.getElementById('doctorBio').value.trim();

        if (!medicalLicenseNumber || !specialization || !clinicName || !city) {
            showFeedback('Please fill all required doctor verification fields.');
            if (!medicalLicenseNumber) document.getElementById('medicalLicenseNumber').focus();
            else if (!specialization) specializationInput.focus();
            else if (!clinicName) document.getElementById('clinicName').focus();
            else document.getElementById('city').focus();
            return;
        }
        if (experienceYears < 0 || Number.isNaN(experienceYears)) {
            showFeedback('Years of experience must be a valid number.');
            return;
        }
        if (bio.length < 20) {
            showFeedback('Short bio must be at least 20 characters.');
            document.getElementById('doctorBio').focus();
            return;
        }

        const documentFile = documentInput && documentInput.files && documentInput.files[0];
        if (!documentFile) {
            showFeedback('Please upload your verification document (PMDC certificate or medical license).');
            if (documentInput) documentInput.focus();
            return;
        }
        const ext = documentFile.name.split('.').pop().toLowerCase();
        if (!ALLOWED_DOC_EXT.includes(ext)) {
            showFeedback('Document must be a PDF, JPG, or PNG file.');
            return;
        }
        if (documentFile.size > MAX_DOC_BYTES) {
            showFeedback('Document is too large. Maximum file size is 5MB.');
            return;
        }
        if (!disclaimerCheckbox || !disclaimerCheckbox.checked) {
            showFeedback('Please confirm the declaration before submitting.');
            return;
        }

        let documentData;
        try {
            documentData = await readFileAsDataUrl(documentFile);
        } catch (readErr) {
            showFeedback('Could not read the document file. Please try another file.');
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        }

        try {
            const response = await fetch(`${API_BASE_URL}/auth/register-doctor`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...baseData,
                    medical_license_number: medicalLicenseNumber,
                    specialization: specialization,
                    clinic_name: clinicName,
                    experience_years: experienceYears,
                    city: city,
                    bio: bio,
                    license_document_name: documentFile.name,
                    license_document_data: documentData
                })
            });
            const data = await response.json();
            if (!response.ok) {
                showFeedback(data.error || 'Verification submission failed. Please try again.');
                return;
            }

            sessionStorage.removeItem('doctorRegistrationBasic');
            doctorRegisterForm.style.display = 'none';
            showPending(data.message || 'Application submitted! We will review within 24 hours.');
        } catch (error) {
            showFeedback('Unable to connect to the server. Please try again.');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = submitLabel;
            }
        }
    });
}

// ==================== FORGOT PASSWORD ====================
const forgotPasswordLink = document.getElementById('forgotPasswordLink');
if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        const email = prompt('Enter your email address:');
        if (email) {
            // Call forgot password API
            fetch(`${API_BASE_URL}/auth/forgot-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            })
            .then(res => res.json())
            .then(data => {
                alert(data.message || 'If email exists, reset link has been sent.');
            })
            .catch(err => console.error('Error:', err));
        }
    });
}

// ==================== CHECK AUTHENTICATION ====================
function checkAuth() {
    const token = localStorage.getItem('token');
    const userType = localStorage.getItem('userType');
    
    if (!token) {
        window.location.href = 'login.html';
        return false;
    }
    
    return { token, userType };
}

// ==================== LOGOUT ====================
function logout() {
    try {
        const keysToRemove = Object.keys(localStorage).filter(
            k => k.startsWith('patientAvatarDataUrl') || k.startsWith('doctorAvatarDataUrl') || k.startsWith('clinixpro_user_name_')
        );
        keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (_e) {}
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userData');
    localStorage.removeItem('patientProfileLocal');
    localStorage.removeItem('patientProfileExtras');
    localStorage.removeItem('patientName');
    localStorage.removeItem('doctorName');
    window.location.href = 'login.html';
    window.location.reload(true);
}

// ==================== UTILITY FUNCTIONS ====================
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validatePhone(phone) {
    const phoneRegex = /^[0-9]{10,15}$/;
    return phoneRegex.test(phone.replace(/\D/g, ''));
}
