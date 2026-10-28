"""Tests never send real email, whatever backend/.env configures (conftest blanks the settings)."""


def test_no_real_email_sender_in_tests() -> None:
    from app.services.dataqs_email import get_email_sender

    assert get_email_sender() is None
