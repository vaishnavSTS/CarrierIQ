"""Makes an API key for a partner system (the partner API, app/api/v1/routes/partner.py).

    python -m app.workers.new_partner_key

Prints the key, to give to the partner once, and its SHA-256 hash, to add to
PARTNER_API_KEY_HASHES (comma-separated) in the server's environment. Only the hash is kept, so a
lost key can't be read back: make a new one, and remove the old hash to switch a key off.
"""

import hashlib
import secrets


def main() -> None:
    key = "css_" + secrets.token_urlsafe(32)
    print("Give this key to the partner (shown once):")
    print(f"  {key}")
    print("Add this hash to PARTNER_API_KEY_HASHES:")
    print(f"  {hashlib.sha256(key.encode()).hexdigest()}")


if __name__ == "__main__":
    main()
