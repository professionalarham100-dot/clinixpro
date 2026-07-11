from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_login_page_uses_runtime_origin_for_api_base():
    text = (ROOT / "frontend" / "login.html").read_text(encoding="utf-8")
    assert "window.location.origin" in text
    assert "http://localhost:5000/api" not in text


def test_auth_script_uses_runtime_origin_for_api_base():
    text = (ROOT / "frontend" / "js" / "auth.js").read_text(encoding="utf-8")
    assert "window.location.origin" in text
    assert "http://localhost:5000/api" not in text
