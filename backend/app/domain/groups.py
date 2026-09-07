import secrets

BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def generate_group_slug() -> str:
    return "".join(secrets.choice(BASE58_ALPHABET) for _ in range(12))
