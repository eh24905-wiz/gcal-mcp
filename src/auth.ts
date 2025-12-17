import { google } from 'googleapis';
import { OAuth2Client, Credentials } from 'google-auth-library';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as http from 'http';
import { URL, fileURLToPath } from 'url';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

// Use the directory where this script lives, not process.cwd()
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(__dirname, '..');

const TOKEN_PATH = path.join(PROJECT_DIR, 'token.json');

interface ClientCredentials {
  installed: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
}

async function findCredentialsFile(): Promise<string> {
  const files = await fs.readdir(PROJECT_DIR);
  const credFile = files.find(f => f.startsWith('client_secret') && f.endsWith('.json'));
  if (!credFile) {
    throw new Error(`No credentials file found. Please place your client_secret*.json file in ${PROJECT_DIR}`);
  }
  return path.join(PROJECT_DIR, credFile);
}

async function loadCredentials(): Promise<ClientCredentials> {
  const credPath = await findCredentialsFile();
  const content = await fs.readFile(credPath, 'utf-8');
  return JSON.parse(content) as ClientCredentials;
}

async function loadSavedToken(): Promise<Credentials | null> {
  try {
    const content = await fs.readFile(TOKEN_PATH, 'utf-8');
    return JSON.parse(content) as Credentials;
  } catch {
    return null;
  }
}

async function saveToken(token: Credentials): Promise<void> {
  await fs.writeFile(TOKEN_PATH, JSON.stringify(token, null, 2));
}

async function getAuthCodeFromBrowser(authUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url!, `http://localhost`);
        const code = url.searchParams.get('code');
        
        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Authentication successful!</h1><p>You can close this window.</p></body></html>');
          server.close();
          resolve(code);
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Authentication failed</h1><p>No code received.</p></body></html>');
        }
      } catch (err) {
        reject(err);
      }
    });

    server.listen(0, 'localhost', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      console.log(`\nAuthorization required. Opening browser...\n`);
      console.log(`If the browser doesn't open automatically, visit:\n${authUrl}\n`);
      
      // Replace the redirect URI with the actual port
      const actualAuthUrl = authUrl.replace('http://localhost', `http://localhost:${port}`);
      console.log(`Listening on port ${port} for callback...`);
      
      // Try to open the browser
      import('child_process').then(({ exec }) => {
        const command = process.platform === 'darwin' ? 'open' :
                       process.platform === 'win32' ? 'start' : 'xdg-open';
        exec(`${command} "${actualAuthUrl}"`);
      });
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timeout'));
    }, 5 * 60 * 1000);
  });
}

export async function authorize(): Promise<OAuth2Client> {
  const credentials = await loadCredentials();
  const { client_id, client_secret, redirect_uris } = credentials.installed;
  
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Check for existing token
  const savedToken = await loadSavedToken();
  if (savedToken) {
    oAuth2Client.setCredentials(savedToken);
    
    // Check if token needs refresh
    if (savedToken.expiry_date && savedToken.expiry_date < Date.now()) {
      try {
        const { credentials: newToken } = await oAuth2Client.refreshAccessToken();
        await saveToken(newToken);
        oAuth2Client.setCredentials(newToken);
      } catch {
        // Token refresh failed, need to re-authenticate
        console.log('Token refresh failed, re-authenticating...');
      }
    }
    return oAuth2Client;
  }

  // No token, need to authenticate
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  const code = await getAuthCodeFromBrowser(authUrl);
  const { tokens } = await oAuth2Client.getToken(code);
  await saveToken(tokens);
  oAuth2Client.setCredentials(tokens);

  console.log('Authentication successful! Token saved.');
  return oAuth2Client;
}

// Run standalone for initial auth
if (process.argv[1]?.includes('auth')) {
  authorize()
    .then(() => {
      console.log('Ready to use gcal-mcp!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Authentication failed:', err);
      process.exit(1);
    });
}

