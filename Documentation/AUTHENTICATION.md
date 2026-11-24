# Sign-In and Access Levels

`index.html` and `unit-selection.html` require sign-in. Visitors without a valid session are sent to `login.html`; after signing in they return to the page they asked for. A "Signed in as ... / Sign out" bar appears at the top of each page.

## Files

- `login.html` - sign-in page.
- `auth.js` - credentials, access levels, session handling, and the page guard. Keep it alongside `index.html` and `unit-selection.html` when hosting.
- `tools/generate-user-hash.py` - creates a credential entry for a new user without putting the password in the repository.

## Access levels

| Level | Label | Permissions |
|-------|-------|-------------|
| `sgs_admin` | SGS Admin | `*` (unrestricted) |

SGS Admin is the only level today. To add a level, add an entry to `ROLES` in `auth.js` with a list of permission names, then check them in page code with `SelectSGSAuth.can("permission-name")`. Pages do not call `can()` yet because the admin level is unrestricted.

## Adding a user

1. Run `python3 tools/generate-user-hash.py <username> <role>` and enter the password at the hidden prompt.
2. Paste the printed entry into the `USERS` table in `auth.js`.

## Behavior

- Passwords are stored only as salted PBKDF2-SHA256 hashes (210,000 iterations). User names are not case-sensitive.
- A session lasts for the browser tab, for up to 8 hours.
- After 5 failed attempts the sign-in form pauses for 30 seconds.
- Sign-in uses the browser's Web Crypto API, which needs HTTPS or `localhost`.

## Limitations

This is a front-end gate, not server-side security. The site is static, so anyone who can download the files can read `auth.js` (including the password hashes) and the pricing and ratings data files, and could bypass the guard. Use a strong, unique password, and move authentication to a server (with the data files served only to signed-in users) before relying on it to protect confidential pricing.
