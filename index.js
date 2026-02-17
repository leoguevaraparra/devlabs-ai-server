
require('dotenv').config();
const path = require('path');
const routes = require('./routes'); // We will create this next
const lti = require('ltijs').Provider;
const Database = require('ltijs-sequelize');

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
            secure: false, // Set to true in production with HTTPS
            sameSite: 'None'
        }
    }
);

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
    // Redirect to the React App (Frontend)
    // We can pass the token in the URL or set a cookie, 
    // but Ltijs sets a session cookie.
    // For this simple setup, we redirect to root.
    return res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// API Routes
lti.app.use('/api', routes);

// Start Server
const setup = async () => {
    await lti.deploy({ port: process.env.PORT || 3000 });
    await registerPlatform();
};

setup();
