#!/usr/bin/env python3
"""
ClinicXPro Support System - API Test Utility
TEST UTILITY FOR ENDPOINTS - NOT A STANDALONE SERVER
All actual endpoints are deployed in backend/app.py

Usage:
  1. Start Flask server first: python app.py
  2. Then run this to test: python support_api.py --test
"""

import requests
import json
import sys
from datetime import datetime

# ==================== CONFIGURATION ====================
API_BASE_URL = "http://127.0.0.1:5000/api"
SUPPORT_API = f"{API_BASE_URL}/support"

# ==================== TEST DATA ====================
TEST_TICKET = {
    "name": "Test User",
    "email": "test@clinicxpro.com",
    "phone": "03001234567",
    "category": "technical",
    "subject": "Test Support Ticket",
    "message": "This is a test ticket to verify the support system is working.",
    "priority": "medium"
}

TEST_CHAT = {
    "session_id": "test_session_001",
    "email": "test@clinicxpro.com",
    "message": "Hello, I need help with my account."
}

# ==================== HELPER FUNCTIONS ====================

def print_section(title):
    """Print a formatted section header"""
    print(f"\n{'='*70}")
    print(f" {title:<68}")
    print(f"{'='*70}")

def test_endpoint(method, endpoint, data=None, params=None):
    """Test an API endpoint"""
    url = f"{SUPPORT_API}{endpoint}"
    print(f"\n{method} {url}")
    if params:
        print(f"Params: {params}")
    if data:
        print(f"Body: {json.dumps(data, indent=2)}")
    
    try:
        if method == "POST":
            response = requests.post(url, json=data)
        elif method == "GET":
            response = requests.get(url, params=params)
        elif method == "PUT":
            response = requests.put(url, json=data)
        else:
            print(f"Unknown method: {method}")
            return None
        
        print(f"Status: {response.status_code}")
        try:
            result = response.json()
            print(f"Response: {json.dumps(result, indent=2)}")
            return result
        except:
            print(f"Response: {response.text}")
            return None
            
    except requests.exceptions.ConnectionError:
        print("ERROR: Cannot connect to Flask server!")
        print("   Run 'python app.py' first to start the server.")
        return None
    except Exception as e:
        print(f"ERROR: {e}")
        return None

# ==================== API TEST SUITE ====================

def test_support_tickets():
    """Test support ticket endpoints"""
    print_section("TESTING SUPPORT TICKET ENDPOINTS")
    
    print("\n[1] Creating a new support ticket...")
    ticket_result = test_endpoint("POST", "/tickets", TEST_TICKET)
    
    if ticket_result and ticket_result.get("success"):
        ticket_id = ticket_result.get("ticket_id")
        
        print(f"\n[2] Retrieving ticket {ticket_id}...")
        test_endpoint("GET", f"/tickets/{ticket_id}")
        
        print(f"\n[3] Listing all tickets for {TEST_TICKET['email']}...")
        test_endpoint("GET", "/tickets", params={"email": TEST_TICKET['email']})
        
        print(f"\n[4] Adding a reply to ticket {ticket_id}...")
        reply_data = {
            "message": "Thank you for contacting us. We will help you shortly.",
            "author": "Support Team"
        }
        test_endpoint("POST", f"/tickets/{ticket_id}/reply", reply_data)
        
        print(f"\n[5] Closing ticket {ticket_id}...")
        test_endpoint("PUT", f"/tickets/{ticket_id}/close")
    else:
        print("Failed to create ticket, skipping further tests")

def test_chat():
    """Test chat endpoints"""
    print_section("TESTING CHAT ENDPOINTS")
    
    print("\n[1] Sending a chat message...")
    message_result = test_endpoint("POST", "/chat", TEST_CHAT)
    
    if message_result and message_result.get("success"):
        session_id = TEST_CHAT["session_id"]
        
        print(f"\n[2] Getting chat history for {session_id}...")
        test_endpoint("GET", f"/chat/{session_id}")
        
        print(f"\n[3] Checking support status...")
        test_endpoint("GET", "/chat/status")
    else:
        print("Failed to send chat message")

def test_stats():
    """Test statistics endpoint"""
    print_section("TESTING STATISTICS ENDPOINT")
    
    print("\n[1] Getting support system statistics...")
    test_endpoint("GET", "/stats")

def run_all_tests():
    """Run all API tests"""
    print("\n" + "CLINICXPRO SUPPORT API TEST SUITE".center(70))
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"API Base URL: {API_BASE_URL}")
    
    test_support_tickets()
    test_chat()
    test_stats()
    
    print_section("TEST SUITE COMPLETE")
    print("\nAll available tests have been run.")
    print("  Check the responses above for any errors.\n")

# ==================== DOCUMENTATION ====================

DOCUMENTATION = """
╔══════════════════════════════════════════════════════════════════════╗
║           CLINICXPRO SUPPORT SYSTEM - API REFERENCE                  ║
╚══════════════════════════════════════════════════════════════════════╝

NOTE: All endpoints are implemented in backend/app.py
This file is for TESTING ONLY - it makes HTTP requests to the running server

SUPPORT TICKET ENDPOINTS:
─────────────────────────────────────────────────────────────────────

1. CREATE SUPPORT TICKET
   POST /api/support/tickets
   
   Request Body:
   {
       "name": "John Doe",
       "email": "john@example.com",
       "phone": "03001234567",
       "category": "technical|billing|account|feature|other",
       "subject": "Issue subject",
       "message": "Detailed description",
       "priority": "high|medium|low"
   }
   
   Response:
   {
       "success": true,
       "message": "Support ticket created successfully",
       "ticket_id": "TKT-1712923456"
   }

2. GET SPECIFIC TICKET
   GET /api/support/tickets/<ticket_id>
   
   Response:
   {
       "success": true,
       "ticket": { ... ticket details ... }
   }

3. LIST USER TICKETS
   GET /api/support/tickets?email=user@example.com&status=open
   
   Query Parameters:
   - email: User email (required)
   - status: open|in-progress|resolved|closed (optional)
   - category: Filter by category (optional)
   
   Response:
   {
       "success": true,
       "tickets": [ ... array of tickets ... ]
   }

4. ADD TICKET REPLY
   POST /api/support/tickets/<ticket_id>/reply
   
   Request Body:
   {
       "message": "Reply text",
       "author": "Support Team"
   }

5. CLOSE TICKET
   PUT /api/support/tickets/<ticket_id>/close
   
   Response:
   {
       "success": true,
       "message": "Ticket closed successfully"
   }

CHAT ENDPOINTS:
─────────────────────────────────────────────────────────────────────

1. SEND CHAT MESSAGE
   POST /api/support/chat
   
   Request Body:
   {
       "session_id": "unique_session",
       "email": "user@example.com",
       "message": "User message"
   }
   
   Response:
   {
       "success": true,
       "reply": "Auto-generated response"
   }

2. GET CHAT HISTORY
   GET /api/support/chat/<session_id>
   
   Response:
   {
       "success": true,
       "messages": [ ... array of messages ... ]
   }

3. CHECK SUPPORT STATUS
   GET /api/support/chat/status
   
   Response:
   {
       "status": "online|offline",
       "team_size": 5,
       "avg_response_time": "2 minutes"
   }

STATISTICS ENDPOINT:
─────────────────────────────────────────────────────────────────────

1. GET SUPPORT STATS
   GET /api/support/stats
   
   Response:
   {
       "total_tickets": 42,
       "open_tickets": 8,
       "in_progress": 5,
       "resolved": 29,
       "avg_resolution_time": "24 hours",
       "satisfaction_rate": 95.5
   }

USAGE EXAMPLES:
─────────────────────────────────────────────────────────────────────

PowerShell:
  # Create ticket
  $body = @{
    name = "Test User"
    email = "test@example.com"
    subject = "Help needed"
    message = "I have a question"
    category = "technical"
  } | ConvertTo-Json
  
  curl -X POST http://127.0.0.1:5000/api/support/tickets `
    -Header "Content-Type: application/json" `
    -Body $body

  # Get tickets
  curl http://127.0.0.1:5000/api/support/tickets?email=test@example.com

cURL (Linux/Mac):
  # Create ticket
  curl -X POST http://127.0.0.1:5000/api/support/tickets \\
    -H "Content-Type: application/json" \\
    -d '{
      "name": "Test User",
      "email": "test@example.com",
      "subject": "Help",
      "message": "Question",
      "category": "technical"
    }'

JavaScript/Fetch:
  fetch('http://127.0.0.1:5000/api/support/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test User',
      email: 'test@example.com',
      subject: 'Help',
      message: 'Question',
      category: 'technical'
    })
  })
  .then(r => r.json())
  .then(data => console.log(data))

"""

# ==================== MAIN ====================

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--help":
        print(DOCUMENTATION)
    elif len(sys.argv) > 1 and sys.argv[1] == "--docs":
        print(DOCUMENTATION)
    elif len(sys.argv) > 1 and sys.argv[1] == "--test":
        run_all_tests()
    else:
        print("\n⚠️  SUPPORT API TEST UTILITY")
        print("┌─────────────────────────────────────────────────────────────────────┐")
        print("│ This is a TEST UTILITY for the ClinicXPro Support System             │")
        print("│                                                                       │")
        print("│ BEFORE RUNNING TESTS:                                               │")
        print("│ 1. Start Flask server: python app.py                                │")
        print("│ 2. Then run tests: python support_api.py --test                     │")
        print("│                                                                       │")
        print("│ OPTIONS:                                                            │")
        print("│   --help    Show this help message                                  │")
        print("│   --docs    Show API documentation                                  │")
        print("│   --test    Run automated API tests                                 │")
        print("└─────────────────────────────────────────────────────────────────────┘\n")
