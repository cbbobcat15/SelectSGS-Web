// SelectSGS Web - front-end sign-in and access levels.
//
// IMPORTANT: this runs entirely in the browser, so it is a sign-in gate and an
// access-level framework, not server-side security. Anyone who can download the
// site files can read this file and the data bundles next to it. Passwords are never
// stored here - only salted PBKDF2-SHA256 hashes. Move authentication to a server
// before relying on it to protect confidential data (e.g. pricing).
//
// Add users with:  python3 tools/generate-user-hash.py <username> <role>
(function () {
    "use strict";

    var SESSION_KEY = "selectsgs-auth";
    var LOCKOUT_KEY = "selectsgs-auth-lockout";
    var SESSION_HOURS = 8;
    var MAX_FAILURES = 5;
    var LOCKOUT_SECONDS = 30;
    var LOGIN_PAGE = "login.html";
    var HOME_PAGE = "index.html";
    var ALLOWED_NEXT = ["index.html", "unit-selection.html"];

    // Access levels. "*" = unrestricted. To add a level later, add an entry here
    // with a list of permission names and check them with SelectSGSAuth.can(name).
    var ROLES = {
        sgs_admin: { label: "SGS Admin", permissions: ["*"] }
    };

    // username (lower case) -> role + password hash.
    var USERS = {
        "cbbobcat15": {
            role: "sgs_admin",
            iterations: 210000,
            salt: "c05812467b773bff916ce73ea3025366",
            hash: "b12e682c360723678587bf75c6679fd263c0175f80178185d9fe1af4853cae87"
        }
    };

    function hexToBytes(hex) {
        var bytes = new Uint8Array(hex.length / 2);
        for (var i = 0; i < bytes.length; i += 1) {
            bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        }
        return bytes;
    }

    function bytesToHex(buffer) {
        return Array.prototype.map.call(new Uint8Array(buffer), function (b) {
            return ("0" + b.toString(16)).slice(-2);
        }).join("");
    }

    function derive(password, saltHex, iterations) {
        var encoder = new TextEncoder();
        return window.crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"])
            .then(function (key) {
                return window.crypto.subtle.deriveBits(
                    { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations: iterations },
                    key, 256);
            })
            .then(bytesToHex);
    }

    function safeEqual(a, b) {
        if (a.length !== b.length) { return false; }
        var diff = 0;
        for (var i = 0; i < a.length; i += 1) { diff |= a.charCodeAt(i) ^ b.charCodeAt(i); }
        return diff === 0;
    }

    function readJson(key) {
        try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch (e) { return null; }
    }

    function lockoutSecondsLeft() {
        var state = readJson(LOCKOUT_KEY);
        if (!state || !state.until) { return 0; }
        return Math.max(0, Math.ceil((state.until - Date.now()) / 1000));
    }

    function recordFailure() {
        var state = readJson(LOCKOUT_KEY) || { failures: 0 };
        state.failures += 1;
        if (state.failures >= MAX_FAILURES) {
            state = { failures: 0, until: Date.now() + LOCKOUT_SECONDS * 1000 };
        }
        sessionStorage.setItem(LOCKOUT_KEY, JSON.stringify(state));
    }

    function currentUser() {
        var session = readJson(SESSION_KEY);
        if (!session || !session.username || !USERS[session.username] || !ROLES[session.role]) { return null; }
        if (!session.expires || session.expires < Date.now()) {
            sessionStorage.removeItem(SESSION_KEY);
            return null;
        }
        return { username: session.username, role: session.role, roleLabel: ROLES[session.role].label };
    }

    function can(permission) {
        var user = currentUser();
        if (!user) { return false; }
        var permissions = ROLES[user.role].permissions;
        return permissions.indexOf("*") !== -1 || permissions.indexOf(permission) !== -1;
    }

    function login(username, password) {
        var wait = lockoutSecondsLeft();
        if (wait > 0) {
            return Promise.resolve({ ok: false, error: "Too many failed attempts. Try again in " + wait + " seconds." });
        }
        if (!window.crypto || !window.crypto.subtle) {
            return Promise.resolve({ ok: false, error: "Sign-in requires a secure connection (HTTPS or localhost)." });
        }
        var name = String(username || "").trim().toLowerCase();
        var user = Object.prototype.hasOwnProperty.call(USERS, name) ? USERS[name] : null;
        // Always run the key derivation so unknown users take as long as known ones.
        var reference = user || { salt: "00000000000000000000000000000000", iterations: 210000, hash: "" };
        return derive(String(password || ""), reference.salt, reference.iterations).then(function (hash) {
            if (user && safeEqual(hash, user.hash)) {
                sessionStorage.removeItem(LOCKOUT_KEY);
                sessionStorage.setItem(SESSION_KEY, JSON.stringify({
                    username: name,
                    role: user.role,
                    expires: Date.now() + SESSION_HOURS * 3600 * 1000
                }));
                return { ok: true };
            }
            recordFailure();
            return { ok: false, error: "Incorrect user name or password." };
        });
    }

    function logout() {
        sessionStorage.removeItem(SESSION_KEY);
        window.location.replace(LOGIN_PAGE);
    }

    function currentPageName() {
        var parts = window.location.pathname.split("/");
        return parts[parts.length - 1] || HOME_PAGE;
    }

    // Call from the <head> of every protected page: sends visitors without a valid
    // session to the login page before the page renders.
    function requireLogin() {
        if (currentUser()) { return true; }
        var page = currentPageName();
        var next = ALLOWED_NEXT.indexOf(page) !== -1 ? "?next=" + encodeURIComponent(page) : "";
        window.location.replace(LOGIN_PAGE + next);
        return false;
    }

    function nextPage() {
        var match = /[?&]next=([^&]*)/.exec(window.location.search);
        var page = match ? decodeURIComponent(match[1]) : "";
        return ALLOWED_NEXT.indexOf(page) !== -1 ? page : HOME_PAGE;
    }

    function mountUserBar() {
        var user = currentUser();
        if (!user || document.getElementById("selectsgs-user-bar")) { return; }
        var bar = document.createElement("div");
        bar.id = "selectsgs-user-bar";
        bar.style.cssText = "display:flex;justify-content:flex-end;align-items:center;gap:12px;" +
            "margin:0 auto 12px;font:14px Arial,sans-serif;color:#263746;width:min(100%,1760px);";
        var label = document.createElement("span");
        label.textContent = "Signed in as " + user.username + " (" + user.roleLabel + ")";
        var button = document.createElement("button");
        button.type = "button";
        button.textContent = "Sign out";
        button.style.cssText = "padding:6px 12px;cursor:pointer;";
        button.addEventListener("click", logout);
        bar.appendChild(label);
        bar.appendChild(button);
        document.body.insertBefore(bar, document.body.firstChild);
    }

    window.SelectSGSAuth = {
        login: login,
        logout: logout,
        currentUser: currentUser,
        can: can,
        requireLogin: requireLogin,
        mountUserBar: mountUserBar,
        nextPage: nextPage,
        homePage: HOME_PAGE
    };
}());
