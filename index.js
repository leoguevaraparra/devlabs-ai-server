
// Last Deployed: 2026-02-19 T15:20
require('dotenv').config();
const path = require('path');
const routes = require('./routes'); // We will create this next
const lti = require('ltijs').Provider;
const Database = require('ltijs-sequelize');
const cors = require('cors');

// Setup Ltijs with SQLite
lti.setup(
    process.env.LTI_KEY,
    {   // Parameter 2: Database Configuration
        plugin: new Database('lti_db', 'user', 'pass', {
            host: 'localhost',
            dialect: 'sqlite',
            storage: 'database.sqlite', // File location for SQLite DB
            logging: false
        })
    },
    {   // Parameter 3: Options
        appRoute: '/',
        loginRoute: '/login',
        keysetRoute: '/keys',
        dynRegRoute: '/register',
        ltiaas: true, // CRITICAL: LTI as a Service mode. Ignores cookies and validates strictly via ltik parameter, perfect for SPAs.
        cookies: {
            secure: true, // ALWAYS true for LTI 1.3 in production (HTTPS)
            sameSite: 'None' // Required for cross-site (iframe) usage
        }
    }
);

// CRITICAL: Trust proxy for Railway/Heroku/Render to detect HTTPS
lti.app.enable('trust proxy');

// GLOBAL DEBUG LOGGER
lti.app.use((req, res, next) => {
    console.log(`[INCOMING] ${req.method} ${req.originalUrl}`);
    console.log(' - Query:', JSON.stringify(req.query));
    // Ocultar token completo en logs por seguridad
    const auth = req.headers.authorization;
    console.log(' - Headers Auth:', auth ? `${auth.substring(0, 15)}...` : 'NONE');
    console.log(' - Res.locals.token:', res.locals.token ? 'PRESENT' : 'MISSING');
    next();
});

// Enable CORS for Frontend
const frontendUrlEnv = process.env.FRONTEND_URL || 'http://localhost:5173';
const cleanFrontendUrl = frontendUrlEnv.replace(/\/$/, ''); // Remove trailing slash if present

lti.app.use(cors({
    origin: cleanFrontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// Register Platform (Moodle)
// In a real app, this should be done dynamically or via ENV/DB
const registerPlatform = async () => {
    try {
        const plat = await lti.registerPlatform({
            url: process.env.MOODLE_URL,
            name: 'Moodle Platform',
            clientId: process.env.MOODLE_CLIENT_ID,
            authenticationEndpoint: process.env.MOODLE_AUTH_ENDPOINT,
            accesstokenEndpoint: process.env.MOODLE_TOKEN_ENDPOINT,
            authConfig: { method: 'JWK_SET', key: process.env.MOODLE_JWKS_URL }
        });
        console.log('Platform registered:', plat);
    } catch (err) {
        if (err.message.includes('Platform already registered')) {
            console.log('Platform already registered.');
        } else {
            console.error('Error registering platform:', err);
        }
    }
};

// On successful Launch
// On successful Launch
// On successful Launch
lti.onConnect(async (token, req, res) => {
    console.log('[LTI] Connection Successful!');
    console.log(' - Token User:', token.user);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Authorization Strategy: Pass the LTIK (Session Key) to the frontend via URL
    const ltik = res.locals.ltik;
    console.log(' - Generated LTIK:', ltik ? 'YES' : 'NO (Undefined)');

    const redirectUrl = new URL(frontendUrl);

    if (ltik) {
        redirectUrl.searchParams.append('ltik', ltik);
    } else {
        console.warn('WARNING: No LTIK found in res.locals. Redirecting without token.');
    }

    console.log(' - Redirecting to:', redirectUrl.toString());
    return lti.redirect(res, redirectUrl.toString());
});

// API Routes
lti.app.use('/api', routes);

// Custom Invalid Token Handler to expose why it failed
lti.onInvalidToken((req, res, next) => {
    console.error('[LTI] Internal invalidToken trigger! Error:', res.locals.err);
    return res.status(401).send(res.locals.err);
});

lti.onSessionTimeout((req, res, next) => {
    console.error('[LTI] Internal sessionTimeout trigger! Error:', res.locals.err);
    return res.status(401).send(res.locals.err);
});

// Start Server
const setup = async () => {
    await lti.deploy({ port: process.env.PORT || 3000 });
    console.log(" [SYSTEM] Servidor LTI Iniciado correctamente (Versión con Logs activados).");
    await registerPlatform();
};

setup();
