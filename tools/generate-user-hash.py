#!/usr/bin/env python3
"""Generate a salted PBKDF2-SHA256 credential entry for auth.js.

Usage:  python3 tools/generate-user-hash.py <username> <role>
The password is read from a hidden prompt, so it never appears in shell history
or in the repository. Paste the printed entry into the USERS table in auth.js.
"""
import getpass, hashlib, json, os, sys

ITERATIONS = 210000

def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    username, role = sys.argv[1].strip().lower(), sys.argv[2].strip()
    password = getpass.getpass("Password: ")
    if password != getpass.getpass("Confirm password: "):
        sys.exit("Passwords do not match.")
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS)
    print(json.dumps({username: {"role": role, "iterations": ITERATIONS,
                                 "salt": salt.hex(), "hash": digest.hex()}}, indent=4))

if __name__ == "__main__":
    main()
