import sys
from datetime import date

sys.path.insert(0, 'backend')
import app as app_module


def test_slots_for_working_day_return_expected_list(monkeypatch):
    monkeypatch.setattr(app_module, 'mysql_ready', lambda: False)
    app_module.mock_doctors[:] = [{
        'doctor_id': 99,
        'name': 'Dr. Test',
        'status': 'active',
        'is_available': True,
        'availability_days': 'Mon,Wed,Fri',
        'office_hours_start': '09:00',
        'office_hours_end': '13:00',
        'slot_duration_minutes': 30,
    }]
    app_module.mock_appointments[:] = []

    payload, error = app_module._build_doctor_slots_payload(99, date(2030, 7, 10))

    assert error is None
    assert 'reason' not in payload
    assert payload['slot_duration_minutes'] == 30
    assert len(payload['slots']) == 8
    assert payload['slots'][0]['time'] == '09:00'
    assert payload['slots'][0]['available'] is True


def test_slots_for_non_working_day_return_reason(monkeypatch):
    monkeypatch.setattr(app_module, 'mysql_ready', lambda: False)
    app_module.mock_doctors[:] = [{
        'doctor_id': 100,
        'name': 'Dr. Test 2',
        'status': 'active',
        'is_available': True,
        'availability_days': 'Mon,Wed,Fri',
        'office_hours_start': '09:00',
        'office_hours_end': '13:00',
        'slot_duration_minutes': 30,
    }]

    payload, error = app_module._build_doctor_slots_payload(100, date(2026, 7, 11))

    assert error is None
    assert payload['slots'] == []
    assert payload['reason'] == 'Doctor is not available on this day'
