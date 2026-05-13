#!/usr/bin/env python3
from app import app

print("\n" + "="*60)
print("SUPPORT API ENDPOINTS INTEGRATED")
print("="*60 + "\n")

endpoints = []
for rule in app.url_map.iter_rules():
    if 'support' in rule.rule:
        methods = ', '.join(sorted(rule.methods - {'HEAD', 'OPTIONS'}))
        endpoints.append((rule.rule, methods))

endpoints.sort()
for endpoint, methods in endpoints:
    print(f"- {endpoint}")
    print(f"  Methods: {methods}\n")

print("="*60)
print(f"Total Support Endpoints: {len(endpoints)}")
print("="*60)
