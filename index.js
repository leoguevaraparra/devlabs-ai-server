
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
            storage: process.env.DB_STORAGE_PATH || 'database.sqlite', // File location for SQLite DB
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

// Enable CORS for allowed frontends
const allowedOrigins = [
    process.env.FRONTEND_URL_M1_S1 ? process.env.FRONTEND_URL_M1_S1.replace(/\/$/, '') : '',
    process.env.FRONTEND_URL_M1_S2 ? process.env.FRONTEND_URL_M1_S2.replace(/\/$/, '') : '',
    process.env.FRONTEND_URL_M1_S3 ? process.env.FRONTEND_URL_M1_S3.replace(/\/$/, '') : ''
].filter(Boolean); // Remove empty strings

lti.app.use(cors({
    origin: function (origin, callback) {
        // En desarrollo o LTI flow it can be undefined
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`[CORS] Rejected Origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
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
lti.onConnect(async (token, req, res) => {
    console.log('[LTI] Connection Successful!');
    console.log(' - Token User:', token.user);
    
    // Authorization Strategy: Pass the LTIK (Session Key) to the frontend via URL
    const ltik = res.locals.ltik;
    console.log(' - Generated LTIK:', ltik ? 'YES' : 'NO (Undefined)');

    // 1. Obtener parámetros personalizados enviados desde Moodle
    // El profesor configurará por ej: lab_id=M1-S2 en los 'Custom parameters'
    const customParams = res.locals.context?.custom || {};
    const labId = customParams.lab_id;
    console.log(` - Requested Lab ID (via custom parameters): ${labId || 'NONE'}`);

    if (!labId) {
        console.error('[LTI] Lanzamiento fallido: Moodle no envio el parámetro lab_id.');
        return res.status(400).send('Error: Contacte a su profesor. Esta actividad no tiene configurado el parámetro "lab_id" que indica a qué laboratorio redirigir.');
    }

    // 2. Determinar la URL destino en base al lab_id
    let targetUrlStr = null;
    
    if (labId === 'M1-S1' || labId === 'm1-s1') {
        targetUrlStr = process.env.FRONTEND_URL_M1_S1;
    } else if (labId === 'M1-S2' || labId === 'm1-s2') {
        targetUrlStr = process.env.FRONTEND_URL_M1_S2;
    } else if (labId === 'M1-S3' || labId === 'm1-s3') {
        targetUrlStr = process.env.FRONTEND_URL_M1_S3;
    }

    if (!targetUrlStr) {
        console.error(`[LTI] Lanzamiento fallido: No se encontró una URL de entorno para el lab_id: ${labId}`);
        return res.status(500).send(`Error de configuración: El laboratorio ${labId} no tiene una URL asociada en el servidor LTI.`);
    }

    try {
        const redirectUrl = new URL(targetUrlStr);

        if (ltik) {
            redirectUrl.searchParams.append('ltik', ltik);
        } else {
            console.warn('WARNING: No LTIK found in res.locals. Redirecting without token.');
        }

        console.log(` - Redirecting to [${labId || 'Default'}]:`, redirectUrl.toString());
        return lti.redirect(res, redirectUrl.toString());
    } catch (e) {
        console.error('[LTI] Error construyendo URL de redirección:', e);
        return res.status(500).send('Error interno en la redirección LTI');
    }
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
