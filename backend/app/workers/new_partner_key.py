"""Makes an API key for a partner system (app/api/v1/routes/partner.py).

    python -m app.workers.new_partner_key               # Estimated ISS API
    python -m app.workers.new_partner_key --score-card  # Score Card Sharing API (report PDFs)

Prints the key, to give to the partner once, and its SHA-256 hash, to add to the server's
environment: PARTNER_API_KEY_HASHES for the Estimated ISS API, SCORE_CARD_API_KEY_HASHES for the
Score Card Sharing API (comma-separated when there are several). A key opens only the API whose
list holds its hash. Only the hash is kept, so a lost key can't be read back: make a new one, and
remove the old hash to switch a key off.
"""

import argparse
import hashlib
import secrets


def main() -> None:
    parser = argparse.ArgumentParser(description="Make a partner API key.")
    parser.add_argument(
        "--score-card", action="store_true", help="a key for the Score Card Sharing API"
    )
    score_card = parser.parse_args().score_card

    key = ("css_sc_" if score_card else "css_") + secrets.token_urlsafe(32)
    setting = "SCORE_CARD_API_KEY_HASHES" if score_card else "PARTNER_API_KEY_HASHES"
    api = "Score Card Sharing API" if score_card else "Estimated ISS API"
    print(f"{api} key. Give this key to the partner (shown once):")
    print(f"  {key}")
    print(f"Add this hash to {setting} (on Render):")
    print(f"  {hashlib.sha256(key.encode()).hexdigest()}")


if __name__ == "__main__":
    main()
