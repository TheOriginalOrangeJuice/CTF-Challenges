"""Generate the RSA keypair used to sign Lucky Channel session tokens.

Run once at image build time. The PUBLIC key is intentionally reachable by
players (that is fine for RS256). The PRIVATE key stays server-side.
"""
import os
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    priv_path = os.path.join(HERE, "private.pem")
    pub_path = os.path.join(HERE, "public.pem")
    if os.path.exists(priv_path) and os.path.exists(pub_path):
        print("keys already exist, skipping")
        return

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    priv_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    )
    pub_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    with open(priv_path, "wb") as f:
        f.write(priv_pem)
    with open(pub_path, "wb") as f:
        f.write(pub_pem)
    print("wrote", priv_path, "and", pub_path)


if __name__ == "__main__":
    main()
