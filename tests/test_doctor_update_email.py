import sys

sys.path.insert(0, 'backend')
import app as app_module


def test_update_doctor_duplicate_email_returns_400(monkeypatch):
    monkeypatch.setattr(app_module, 'mysql_ready', lambda: True)
    monkeypatch.setattr(app_module, 'ensure_doctors_profile_schema', lambda: None)

    def fake_db_select_one(query, params=None):
        query = query.strip().lower()
        if query.startswith('select doctor_id, email from doctors'):
            return {'doctor_id': 1, 'email': 'current@doc.com'}
        if query.startswith("select user_id from users where email=%s and user_type='doctor'"):
            return {'user_id': 1}
        if query.startswith('select user_id from users where email=%s and user_id<>%s'):
            return {'user_id': 2}
        return None

    monkeypatch.setattr(app_module, 'db_select_one', fake_db_select_one)

    def fake_db_execute(query, params=None):
        raise Exception("Duplicate entry 'users.email' for key 'email'")

    monkeypatch.setattr(app_module, 'db_execute', fake_db_execute)

    token = 'fake-jwt-token'
    monkeypatch.setattr(app_module.jwt, 'decode', lambda token_val, secret, algorithms=None: {'user_id': 1, 'user_type': 'doctor'})
    app_module.app.config['JWT_SECRET_KEY'] = 'test-secret'

    with app_module.app.test_request_context(
        '/api/doctors/1', method='PUT', json={'email': 'new@doc.com'}, headers={'Authorization': f'Bearer {token}'}
    ):
        response, status_code = app_module.update_doctor(1)

    assert status_code == 400
    assert response.get_json() == {'error': 'Email already in use'}
