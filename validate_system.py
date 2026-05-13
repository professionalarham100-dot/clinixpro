#!/usr/bin/env python3
"""
ClinicXPro Support System - Error Detection & Validation
This script validates all components of the new support system
"""

import os
import json
from pathlib import Path

# Colors for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
RESET = '\033[0m'

def check_file_exists(filepath):
    """Check if a file exists"""
    return os.path.exists(filepath)

def check_json_validity(filepath):
    """Check if JSON file is valid"""
    try:
        if os.path.exists(filepath):
            with open(filepath, 'r') as f:
                json.load(f)
            return True, "Valid JSON"
        return True, "File doesn't exist yet (will be created)"
    except json.JSONDecodeError as e:
        return False, f"JSON Error: {e}"

def validate_support_system():
    """Validate the entire support system"""
    
    print("\n" + "="*70)
    print("CLINICXPRO SUPPORT SYSTEM - VALIDATION REPORT")
    print("="*70 + "\n")
    
    # Define all required files
    frontend_files = [
        ("support.html", "Support center page"),
        ("tickets.html", "Ticket tracking dashboard"),
        ("tutorials.html", "Video tutorials library"),
        ("css/support.css", "Support page styles"),
        ("css/tickets.css", "Ticket dashboard styles"),
        ("css/tutorials.css", "Tutorial page styles"),
        ("js/support.js", "Support page functionality"),
        ("js/tickets.js", "Ticket dashboard logic"),
        ("js/tutorials.js", "Tutorial page logic"),
        ("js/live-chat.js", "Live chat widget"),
    ]
    
    backend_files = [
        ("app.py", "Flask application with API endpoints"),
        ("data/", "Data directory for storage"),
    ]
    
    docs = [
        ("SUPPORT_INTEGRATION_GUIDE.md", "Setup and integration guide"),
        ("SUPPORT_SYSTEM_COMPLETE.md", "Completion status"),
    ]
    
    # Check frontend files
    print(f"{YELLOW}[1] FRONTEND FILES{RESET}\n")
    frontend_ok = True
    for filename, description in frontend_files:
        filepath = f"frontend/{filename}"
        exists = check_file_exists(filepath)
        status = f"{GREEN}[OK]{RESET}" if exists else f"{RED}[FAIL]{RESET}"
        print(f"{status} {filename:<25} - {description}")
        if not exists:
            frontend_ok = False
    
    # Check backend files
    print(f"\n{YELLOW}[2] BACKEND FILES{RESET}\n")
    backend_ok = True
    for filename, description in backend_files:
        filepath = f"backend/{filename}"
        if filename.endswith("/"):
            exists = os.path.isdir(filepath)
        else:
            exists = check_file_exists(filepath)
        status = f"{GREEN}[OK]{RESET}" if exists else f"{RED}[FAIL]{RESET}"
        print(f"{status} {filename:<25} - {description}")
        if not exists:
            backend_ok = False
    
    # Check documentation
    print(f"\n{YELLOW}[3] DOCUMENTATION{RESET}\n")
    docs_ok = True
    for filename, description in docs:
        filepath = filename
        exists = check_file_exists(filepath)
        status = f"{GREEN}[OK]{RESET}" if exists else f"{RED}[FAIL]{RESET}"
        print(f"{status} {filename:<35} - {description}")
        if not exists:
            docs_ok = False
    
    # Check backend API integration
    print(f"\n{YELLOW}[4] BACKEND API INTEGRATION{RESET}\n")
    try:
        import sys
        sys.path.insert(0, 'backend')
        from app import app
        
        api_endpoints = [
            '/api/support/tickets',
            '/api/support/chat',
            '/api/support/stats',
        ]
        
        found_endpoints = []
        for rule in app.url_map.iter_rules():
            found_endpoints.append(rule.rule)
        
        api_ok = True
        for endpoint in api_endpoints:
            found = any(endpoint in ep for ep in found_endpoints)
            status = f"{GREEN}[OK]{RESET}" if found else f"{RED}[FAIL]{RESET}"
            print(f"{status} {endpoint:<40} - Registered")
            if not found:
                api_ok = False
        
    except Exception as e:
        print(f"{RED}[FAIL]{RESET} Error checking API: {e}")
        api_ok = False
    
    # Check data storage
    print(f"\n{YELLOW}[5] DATA STORAGE{RESET}\n")
    data_ok = True
    
    tickets_file = "backend/data/tickets.json"
    tickets_valid, msg = check_json_validity(tickets_file)
    status = f"{GREEN}[OK]{RESET}" if tickets_valid else f"{RED}[FAIL]{RESET}"
    print(f"{status} {tickets_file:<40} - {msg}")
    if not tickets_valid:
        data_ok = False
    
    chat_file = "backend/data/chat_messages.json"
    chat_valid, msg = check_json_validity(chat_file)
    status = f"{GREEN}[OK]{RESET}" if chat_valid else f"{RED}[FAIL]{RESET}"
    print(f"{status} {chat_file:<40} - {msg}")
    if not chat_valid:
        data_ok = False
    
    # Summary
    print(f"\n{'='*70}")
    print(f"{'VALIDATION SUMMARY':<35} {'STATUS':<35}")
    print(f"{'='*70}")
    
    summary = {
        "Frontend Files": ("PASS" if frontend_ok else "FAIL"),
        "Backend Files": ("PASS" if backend_ok else "FAIL"),
        "Documentation": ("PASS" if docs_ok else "FAIL"),
        "API Integration": ("PASS" if api_ok else "FAIL"),
        "Data Storage": ("PASS" if data_ok else "FAIL"),
    }
    
    for check, status in summary.items():
        color = GREEN if status == "PASS" else RED
        print(f"{check:<35} {color}{status}{RESET}")
    
    print(f"{'='*70}\n")
    
    # Overall status
    all_ok = all([frontend_ok, backend_ok, docs_ok, api_ok, data_ok])
    if all_ok:
        print(f"{GREEN}ALL SYSTEMS OPERATIONAL - NO ERRORS FOUND{RESET}\n")
    else:
        print(f"{RED}ERRORS DETECTED - SEE ABOVE{RESET}\n")
    
    return all_ok

if __name__ == "__main__":
    import sys
    success = validate_support_system()
    sys.exit(0 if success else 1)
