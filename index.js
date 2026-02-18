
require('dotenv').config();
const path = require('path');
const routes = require('./routes'); // We will create this next
const lti = require('ltijs').Provider;
const Database = require('ltijs-sequelize');
const cors = require('cors');

// Setup Ltijs with SQLite
lti.setup(
    process.env.LTI_KEY,
    {
        plugin: new Database('lti_db', 'user', 'pass', {
            host: 'localhost',
            dialect: 'sqlite',
            storage: 'database.sqlite', // File location for SQLite DB
            logging: false
        }),
        appRoute: '/',
        loginRoute: '/login',
        keysetRoute: '/keys',
        dynRegRoute: '/register',
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
    console.log(' - Headers Auth:', req.headers.authorization);
    console.log(' - Res.locals.token:', res.locals.token ? 'PRESENT' : 'MISSING');
    next();
});

// Enable CORS for Frontend
lti.app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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
lti.onConnect(async (token, req, res) => {
    // Redirect to the React App (Frontend)
    // We redirect to the URL specified in Env (Netlify) or localhost for dev
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Authorization Strategy: Pass the LTIK (Session Key) to the frontend via URL
    // The frontend will capture this and send it back in the 'Authorization' header
    // to bypass 3rd party cookie blocking.
    const ltik = res.locals.ltik;
    const redirectUrl = new URL(frontendUrl);
    redirectUrl.searchParams.append('ltik', ltik);

    return lti.redirect(res, redirectUrl.toString());
});

// API Routes
lti.app.use('/api', routes);

// Start Server
const setup = async () => {
    await lti.deploy({ port: process.env.PORT || 3000 });
    console.log(" [SYSTEM] Servidor LTI Iniciado correctamente (Versión con Logs activados).");
    await registerPlatform();
};

setup();
