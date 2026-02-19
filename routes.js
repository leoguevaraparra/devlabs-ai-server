const router = require('express').Router();
const lti = require('ltijs').Provider;

const jwt = require('jsonwebtoken');

// Middleware to verify LTI Session
const verifyLti = (req, res, next) => {
    // 1. Check if ltijs usage already populated it (via cookies)
    if (res.locals.token) {
        console.log('[Middleware] LTI Token verified for user (Cookie):', res.locals.token.user);
        return next();
    }

    // 2. Fallback: Check for LTIK in query or headers
    const ltik = req.query.ltik || req.headers['ltik'] || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

    if (ltik) {
        try {
            // Verify LTIK using the LTI_KEY
            // NOTE: ltijs signs the session token with the LTI_KEY.
            const decoded = jwt.verify(ltik, process.env.LTI_KEY);

            // Re-hydrate locals
            res.locals.token = decoded;
            res.locals.ltik = ltik;

            console.log('[Middleware] LTI Token verified manually (Header/Query):', decoded.user);
            return next();
        } catch (err) {
            console.log('[Middleware] Manual LTIK Verification failed:', err.message);
        }
    }

    // DEBUGGING LOGS
    console.log('[Middleware] Unauthorized access attempt.');
    console.log('- Headers Auth:', req.headers.authorization);
    console.log('- Query LTIK:', req.query.ltik);
    console.log('- Cookies:', req.headers.cookie ? 'Present' : 'None'); // Don't log full cookie for security
    console.log('- Res.locals keys:', Object.keys(res.locals));

    return res.status(401).send('Unauthorized: No LTI Session Found');
};

// GET /api/me - Return user info from LTI Token
router.get('/me', verifyLti, (req, res) => {
    const token = res.locals.token;
    return res.json({
        userId: token.user,
        roles: token.roles,
        context: token.platformContext,
        platformId: token.iss
    });
});

// POST /api/grade - Send grade to Moodle
router.post('/grade', verifyLti, async (req, res) => {
    try {
        const idToken = res.locals.token; // IdToken
        const score = req.body.score; // 0-100

        // Convert to 0.0 - 1.0
        const grade = score / 100;

        const gradeObj = {
            scoreGiven: grade,
            activityProgress: 'Completed',
            gradingProgress: 'FullyGraded'
        };

        // Message to send to the platform
        // LineItem is usually passed in the id_token or we can discover it.
        // For simplicity, we try to use the one in the token claim if available
        // LTI 1.3: https://purl.imsglobal.org/spec/lti-ags/claim/endpoint

        const lineItem = idToken.platformContext.endpoint; // Check actual claim path in debugging

        if (!lineItem) {
            console.log("No LineItem found in token. Creating new one or using default.");
            // In a real scenario, we might query line items or creating one.
        }

        // Using Ltijs Grade Service
        // This is a simplification. Real implementation requires handling LineItems.
        // lineItem should be an object/url.

        await lti.Grade.scorePublish(idToken, gradeObj);
        return res.sendStatus(200);

    } catch (err) {
        console.error(err);
        return res.status(500).send({ error: err.message });
    }
});

module.exports = router;
