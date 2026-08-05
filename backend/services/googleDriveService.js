// backend/services/googleDriveService.js
// Google Drive integration for SMJ backups. Uses Node's global fetch (Node 18+),
// so no extra dependency is required. Implements the OAuth2 authorization-code
// flow with a refresh token stored in SystemSettings.
const crypto = require("crypto");
const SystemSettings = require("../models/systemSettingsModel");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const SCOPES = "email profile https://www.googleapis.com/auth/drive.file";
const BACKUP_FOLDER_NAME = "SMJ Backups";

// In-memory access token cache (tokens expire in ~1h, refresh on demand).
let tokenCache = { token: "", expiresAt: 0 };

const getSingletonSettings = async () => {
  const settings = await SystemSettings.findOne({}).sort({ createdAt: 1 });
  return settings || (await SystemSettings.create({}));
};

const getClientCredentials = (settings) => ({
  clientId: String(settings?.gdriveClientId || process.env.GDRIVE_CLIENT_ID || "").trim(),
  clientSecret: String(settings?.gdriveClientSecret || process.env.GDRIVE_CLIENT_SECRET || "").trim(),
});

const isConfigured = (settings) => {
  const { clientId, clientSecret } = getClientCredentials(settings);
  return Boolean(clientId && clientSecret);
};

const isConnected = (settings) =>
  isConfigured(settings) && Boolean(String(settings?.gdriveRefreshToken || "").trim());

/**
 * Redirect URI the user must register in their Google Cloud console.
 * Uses the host the current request came from, so it adapts to desktop
 * (http://localhost:<port>) and web (https://<deployed-domain>) automatically.
 */
const getRedirectUri = (req = null) => {
  const configured = String(process.env.GDRIVE_REDIRECT_URI || "").trim();
  if (configured) return configured;
  const proto = req?.protocol === "http" && req?.get?.("x-forwarded-proto") === "https"
    ? "https"
    : req?.protocol || "http";
  const host = req?.get?.("host") || `localhost:${process.env.PORT || 5000}`;
  return `${proto}://${host}/api/settings/backup/gdrive/callback`;
};

const buildAuthUrl = ({ clientId, redirectUri, state }) => {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

const postTokenRequest = async (body) => {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.error_description || data.error || "Google OAuth token request failed."
    );
  }
  return data;
};

const getAccessToken = async (settings, { force = false } = {}) => {
  if (!force && tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) {
    return tokenCache.token;
  }
  const refreshToken = String(settings?.gdriveRefreshToken || "").trim();
  if (!refreshToken) throw new Error("Google Drive is not connected.");
  const { clientId, clientSecret } = getClientCredentials(settings);
  const data = await postTokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  if (!data.access_token) {
    throw new Error("Failed to refresh Google Drive access token. Reconnect Google Drive.");
  }
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  return tokenCache.token;
};

const driveFetch = async (url, options = {}, settings) => {
  const token = await getAccessToken(settings);
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Drive request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res;
};

/**
 * Begin the OAuth flow. Persists a random CSRF state token and returns the URL
 * the user should open in their browser.
 */
exports.startOAuth = async (req) => {
  const settings = await getSingletonSettings();
  const { clientId } = getClientCredentials(settings);
  if (!clientId) {
    throw new Error(
      "Google Drive is not configured. Add your Google Cloud OAuth Client ID and Secret in Backup Settings first."
    );
  }
  const state = crypto.randomBytes(16).toString("hex");
  settings.gdriveOAuthState = state;
  await settings.save();
  const redirectUri = getRedirectUri(req);
  return { authUrl: buildAuthUrl({ clientId, redirectUri, state }), redirectUri };
};

/**
 * Exchange an authorization code for tokens (used by the /gdrive/callback
 * route after the browser redirect, or the manual paste-code endpoint).
 */
exports.exchangeCode = async ({ code, req, expectedState = "" }) => {
  const settings = await getSingletonSettings();
  if (expectedState) {
    if (String(settings?.gdriveOAuthState || "") !== String(expectedState || "")) {
      throw new Error("Google Drive OAuth state mismatch. Please try again.");
    }
  }
  const { clientId, clientSecret } = getClientCredentials(settings);
  const redirectUri = getRedirectUri(req);
  const data = await postTokenRequest({
    code: String(code || "").trim(),
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (!data.access_token) {
    throw new Error(data.error_description || "Google OAuth code exchange failed.");
  }
  const email = await exports.getUserEmail(data.access_token);
  settings.gdriveRefreshToken = String(data.refresh_token || settings.gdriveRefreshToken || "").trim();
  settings.gdriveAccountEmail = email;
  settings.gdriveOAuthState = "";
  await settings.save();
  tokenCache = { token: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return { email, connected: Boolean(settings.gdriveRefreshToken) };
};

exports.getUserEmail = async (accessToken) => {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return "";
  const data = await res.json().catch(() => ({}));
  return String(data?.email || "").trim();
};

exports.revokeAccess = async (settings) => {
  const refreshToken = String(settings?.gdriveRefreshToken || "").trim();
  if (refreshToken) {
    try {
      await fetch(`${REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, { method: "POST" });
    } catch (_) {
      /* best effort */
    }
  }
  tokenCache = { token: "", expiresAt: 0 };
};

exports.getStatus = async () => {
  const settings = await getSingletonSettings();
  return {
    configured: isConfigured(settings),
    connected: isConnected(settings),
    accountEmail: String(settings?.gdriveAccountEmail || "").trim(),
    folderId: String(settings?.gdriveFolderId || "").trim(),
    lastDriveBackupAt: settings?.gdriveLastBackupAt || null,
  };
};

const ensureBackupFolder = async (settings) => {
  const token = await getAccessToken(settings);
  const existing = await driveFetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(
      `name='${BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
    )}&fields=files(id,name)`,
    {},
    settings
  );
  const list = await existing.json().catch(() => ({}));
  const found = list?.files?.[0];
  if (found?.id) return found.id;
  const created = await driveFetch(
    `${DRIVE_API}/files?fields=id,name`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: BACKUP_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
    },
    settings
  );
  const file = await created.json().catch(() => ({}));
  if (!file?.id) throw new Error("Could not create Google Drive backup folder.");
  settings.gdriveFolderId = file.id;
  await settings.save();
  return file.id;
};

/**
 * Upload a backup JSON file to Drive. Returns the created file metadata.
 */
exports.uploadBackupFile = async ({ fileName, jsonBuffer, settings = null }) => {
  const target = settings || (await getSingletonSettings());
  const folderId = String(target.gdriveFolderId || "").trim() || (await ensureBackupFolder(target));
  const token = await getAccessToken(target);
  const boundary = `smj-${crypto.randomBytes(8).toString("hex")}`;
  const metadata = JSON.stringify({
    name: fileName,
    mimeType: "application/json",
    parents: [folderId],
  });
  const media = Buffer.isBuffer(jsonBuffer) ? jsonBuffer : Buffer.from(jsonBuffer);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\nContent-Length: ${media.length}\r\n\r\n`),
    media,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await fetch(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,size,modifiedTime`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Drive upload failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json().catch(() => ({}));
  return {
    id: data?.id || "",
    name: data?.name || fileName,
    size: Number(data?.size || 0),
    modifiedTime: data?.modifiedTime || null,
  };
};

/**
 * List backup files stored in the SMJ Backups Drive folder (newest first).
 */
exports.listBackupFiles = async ({ settings = null } = {}) => {
  const target = settings || (await getSingletonSettings());
  const folderId = String(target.gdriveFolderId || "").trim();
  const conditions = ["name contains 'smj-backup'", "mimeType='application/json'", "trashed=false"];
  if (folderId) conditions.push(`'${folderId}' in parents`);
  const res = await driveFetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(conditions.join(" and "))}` +
      `&orderBy=modifiedTime desc&pageSize=100&fields=files(id,name,size,modifiedTime)`,
    {},
    target
  );
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.files) ? data.files : [];
};

/**
 * Download a backup file's JSON content from Drive.
 */
exports.downloadBackupFile = async ({ fileId, settings = null } = {}) => {
  const target = settings || (await getSingletonSettings());
  const res = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {}, target);
  return res.text();
};

exports.deleteBackupFile = async ({ fileId, settings = null } = {}) => {
  const target = settings || (await getSingletonSettings());
  await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, { method: "DELETE" }, target);
};
