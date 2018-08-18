import express from 'express';
import { post } from 'superagent';
import { config } from 'dotenv';
import v4 from 'uuid/v4';

config();
const app = express();

app.get('/oauth/state', (_, res) => {
    res.send(v4());
});

app.post('/auth', async (req, res) => {
    console.log('got authorization token:', req.body.code);
    const monzoAuthUrl = 'https://api.monzo.com/oauth2/token';
    try {
        const response = await post(monzoAuthUrl)
            .type('form')
            .send({
                grant_type: 'authorization_code',
                client_id: process.env.MONZO_CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                redirect_uri: process.env.REDIRECT_URI,
                code: req.body.code,
            });
        res.send(response.body.access_token);
    } catch (e) {
        res.status(500).send('Error retrieving authorization code: ' + e);
    }
});

app.listen(3000, () => console.log('Daily Dosh server running'));
