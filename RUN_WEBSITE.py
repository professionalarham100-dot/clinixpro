#!/usr/bin/env python3
"""
ClinicXPro - Smart Clinical Management System
Startup Script - Runs Backend + Opens Frontend
"""

import os
import sys
import subprocess
import webbrowser
import time
from pathlib import Path

def main():
    project_root = Path(__file__).parent
    backend_path = project_root / "backend"
    frontend_path = project_root / "frontend"
    
    print("\n" + "="*70)
    print(" "*15 + "CLINICXPRO - STARTUP SCRIPT")
    print("="*70 + "\n")
    
    # Check if backend app.py exists
    app_file = backend_path / "app.py"
    if not app_file.exists():
        print(f"❌ Error: {app_file} not found!")
        return False
    
    # Check if frontend files exist
    frontend_files = ["index.html", "support.html", "tickets.html", "tutorials.html"]
    for file in frontend_files:
        if not (frontend_path / file).exists():
            print(f"⚠️  Warning: {file} not found in frontend/")
    
    print("✓ Project files verified\n")
    
    # Start Flask backend
    print("[1] Starting Flask Backend Server...")
    print("-" * 70)
    os.chdir(backend_path)
    
    try:
        # Start Flask app in a subprocess
        flask_process = subprocess.Popen(
            [sys.executable, "app.py"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True
        )
        
        print("⏳ Waiting for server to start...")
        time.sleep(3)
        
        if flask_process.poll() is not None:
            # Process ended - check for errors
            _, stderr = flask_process.communicate()
            print(f"❌ Flask failed to start: {stderr}")
            return False
        
        print("✓ Flask server running on http://127.0.0.1:5000\n")
        
    except Exception as e:
        print(f"❌ Error starting Flask: {e}")
        return False
    
    # Open frontend in browser
    print("[2] Opening Frontend in Browser...")
    print("-" * 70)
    
    frontend_url = f"file:///{frontend_path.absolute()}\\index.html"
    frontend_url = frontend_url.replace("\\", "/")
    
    print(f"Opening: {frontend_url}\n")
    
    try:
        webbrowser.open(frontend_url)
        print("✓ Browser opened\n")
    except Exception as e:
        print(f"⚠️  Could not auto-open browser: {e}")
        print(f"   Manually open: {frontend_url}\n")
    
    # Display URLs
    print("="*70)
    print(" "*20 + "AVAILABLE URLS")
    print("="*70)
    print(f"📱 Main Application:     file:///{frontend_path.absolute()}/index.html".replace("\\", "/"))
    print(f"💬 Support Center:       file:///{frontend_path.absolute()}/support.html".replace("\\", "/"))
    print(f"🎫 Ticket Dashboard:     file:///{frontend_path.absolute()}/tickets.html".replace("\\", "/"))
    print(f"📚 Video Tutorials:      file:///{frontend_path.absolute()}/tutorials.html".replace("\\", "/"))
    print(f"\n🔌 Backend API:          http://127.0.0.1:5000/api/")
    print(f"📊 Support Tickets API:  http://127.0.0.1:5000/api/support/tickets")
    print(f"💬 Chat API:             http://127.0.0.1:5000/api/support/chat")
    print("="*70 + "\n")
    
    print("✓ ClinicXPro is now running!")
    print("  Press Ctrl+C to stop the server\n")
    
    # Keep Flask running
    try:
        flask_process.wait()
    except KeyboardInterrupt:
        print("\n\n⏹️  Shutting down server...")
        flask_process.terminate()
        flask_process.wait()
        print("✓ Server stopped\n")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
