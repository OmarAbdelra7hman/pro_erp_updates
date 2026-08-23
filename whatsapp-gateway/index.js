const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');

const app = express();
const gatewayLogPath = path.join(__dirname, 'gateway-error.log');
function logGatewayError(context, error) {
    const detail = error && (error.stack || error.message) ? (error.stack || error.message) : String(error);
    console.error(`${context}:`, detail);
    try {
        fs.appendFileSync(gatewayLogPath, `[${new Date().toISOString()}] ${context}\n${detail}\n\n`);
    } catch (_) { }
}
const apiKey = process.env.WHATSAPP_GATEWAY_API_KEY;
if (!apiKey || apiKey.length < 32) {
    throw new Error('WHATSAPP_GATEWAY_API_KEY must be configured with at least 32 characters');
}

// The gateway is an internal service. Browser-wide CORS and anonymous access
// would allow any reachable client to send messages from the linked account.
app.use(cors({ origin: false }));
app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
    const authorization = req.get('authorization') || '';
    if (authorization !== `Bearer ${apiKey}`) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
});

let qrCodeDataUrl = null;
let isAuthenticated = false;
let isReady = false;

console.log('Initializing WhatsApp Client...');

const authPath = process.env.WHATSAPP_AUTH_PATH || path.join(__dirname, '.wwebjs_auth');

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: authPath }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-extensions']
    }
});

client.on('qr', async (qr) => {
    console.log('QR Code Received. Need to scan.');
    try {
        qrCodeDataUrl = await qrcode.toDataURL(qr);
        isAuthenticated = false;
        isReady = false;
    } catch (err) {
        console.error('Failed to generate QR code', err);
    }
});

client.on('ready', () => {
    console.log('WhatsApp Client is READY!');
    qrCodeDataUrl = null;
    isAuthenticated = true;
    isReady = true;
});

client.on('authenticated', () => {
    console.log('WhatsApp Client Authenticated');
    isAuthenticated = true;
    qrCodeDataUrl = null;
});

client.on('auth_failure', msg => {
    console.error('Authentication failed', msg);
    isAuthenticated = false;
    isReady = false;
});

client.on('disconnected', (reason) => {
    console.log('WhatsApp Client disconnected', reason);
    isAuthenticated = false;
    isReady = false;
});

client.initialize();

// API Endpoints

app.get('/status', (req, res) => {
    res.json({
        isAuthenticated,
        isReady,
        hasQrCode: !!qrCodeDataUrl
    });
});

app.get('/qr', (req, res) => {
    if (isReady) {
        return res.json({ status: 'ready', qr: null });
    }
    if (qrCodeDataUrl) {
        return res.json({ status: 'pending', qr: qrCodeDataUrl });
    }
    res.json({ status: 'starting', qr: null });
});

app.get('/groups', async (req, res) => {
    if (!isReady && !isAuthenticated) {
        return res.status(400).json({ success: false, error: 'WhatsApp is not ready' });
    }
    try {
        let groups = [];
        try {
            const chats = await client.getChats();
            groups = chats
                .filter(chat => chat.isGroup)
                .map(chat => ({ id: chat.id._serialized, name: chat.name || chat.id._serialized }));
        } catch (getChatsError) { }

        try {
            const contacts = await client.getContacts();
            groups.push(...contacts
                .filter(contact => contact.isGroup || contact.id?._serialized?.endsWith('@g.us'))
                .map(contact => ({
                    id: contact.id._serialized,
                    name: contact.name || contact.pushname || contact.shortName || contact.id._serialized
                })));
        } catch (getContactsError) { }

        // Some WhatsApp Web builds currently break whatsapp-web.js getChats(),
        // and newly joined groups may exist in Contacts before Chat. Merge the
        // minimal metadata from both stores without serializing full chat data.
        const storeGroups = await client.pupPage.evaluate(() => {
            const readCollection = collection => collection?.getModelsArray
                ? collection.getModelsArray()
                : (collection?.models || []);
            const getId = model => {
                const raw = model?.id;
                if (!raw) return '';
                if (typeof raw === 'string') return raw;
                return raw._serialized || raw.toString?.() || '';
            };
            const isGroup = model => {
                const id = getId(model);
                const server = model?.id?.server || model?.id?._server || '';
                return model?.isGroup === true || server === 'g.us' || id.endsWith('@g.us');
            };
            const toGroup = model => {
                const id = getId(model);
                return {
                    id,
                    name: model?.name || model?.formattedTitle || model?.formattedName ||
                          model?.pushname || model?.contact?.name || id
                };
            };
            const store = window.Store || {};
            return [...readCollection(store.Chat), ...readCollection(store.Contact)]
                .filter(isGroup)
                .map(toGroup)
                .filter(group => group.id);
        });
        groups.push(...storeGroups);

        // Deduplicate groups that appeared in both stores.
        groups = Array.from(new Map(groups.map(group => [group.id, group])).values());
        groups.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
        res.json(groups);
    } catch (error) {
        logGatewayError('Error loading groups', error);
        res.status(500).json({ success: false, error: error?.message || 'Unknown gateway error' });
    }
});

app.post('/send-pdf', async (req, res) => {
    if (!isReady) {
        return res.status(400).json({ success: false, error: 'WhatsApp is not ready' });
    }

    try {
        const { phone, pdfBase64, filename, message } = req.body;
        
        if (!phone || !pdfBase64) {
            return res.status(400).json({ success: false, error: 'Missing phone or pdfBase64' });
        }

        // Format phone number to WhatsApp format (number@c.us)
        // Assume phone already contains country code but we will strip '+' if present
        const chatId = phone.endsWith('@g.us') ? phone : `${phone.replace(/\D/g, '')}@c.us`;

        const media = new MessageMedia('application/pdf', pdfBase64, filename || 'document.pdf');
        
        const response = await client.sendMessage(chatId, media, { caption: message || '' });
        
        // Some WhatsApp Web builds do not expose a stable message id even
        // though delivery succeeded.  Sending must not be reported as failed
        // merely because that optional field is unavailable.
        res.json({ success: true, messageId: response?.id?.id ?? null });
    } catch (error) {
        logGatewayError('Error sending PDF', error);
        res.status(500).json({ success: false, error: error?.message || 'Unknown gateway error' });
    }
});

app.post('/send-message', async (req, res) => {
    // Recent WhatsApp Web builds can remain authenticated and fully usable
    // without emitting whatsapp-web.js's ready event. In that state group
    // discovery and messaging still work, so authenticated is sufficient.
    if (!isReady && !isAuthenticated) {
        return res.status(400).json({ success: false, error: 'WhatsApp is not ready' });
    }

    try {
        const { phone, message } = req.body;
        
        if (!phone || !message) {
            return res.status(400).json({ success: false, error: 'Missing phone or message' });
        }

        const chatId = phone.endsWith('@g.us') ? phone : `${phone.replace(/\D/g, '')}@c.us`;
        
        const response = await client.sendMessage(chatId, message);
        
        // Delivery can succeed while newer WhatsApp Web builds omit the
        // optional message id from the wrapper response.
        res.json({ success: true, messageId: response?.id?.id ?? null });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/logout', async (req, res) => {
    try {
        if (isAuthenticated || isReady) {
            await client.logout();
        }
        isAuthenticated = false;
        isReady = false;
        qrCodeDataUrl = null;
        res.json({ success: true });
    } catch (error) {
        console.error('Error during logout:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`WhatsApp Gateway running on http://localhost:${PORT}`);
});

// Graceful Shutdown Logic to prevent EADDRINUSE (Port 3000 stuck)
const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    try {
        if (client) {
            console.log('Destroying WhatsApp client...');
            await client.destroy();
        }
    } catch (err) {
        console.error('Error during client destruction:', err);
    }
    
    server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
    });

    // Force close after 5 seconds if graceful shutdown fails
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 5000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    shutdown('uncaughtException');
});

// Automatically exit if standard input is closed (e.g., if parent .NET process is killed abruptly)
process.stdin.resume();
process.stdin.on('end', () => shutdown('stdin end'));
process.stdin.on('close', () => shutdown('stdin close'));
process.stdin.on('error', () => shutdown('stdin error'));
